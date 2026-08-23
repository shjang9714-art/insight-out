import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { sendResendEmail, normalizeResendError, type ResendAttachment } from '@/lib/email/resend'
import { buildBookmarkEmailHtml, type BookmarkEmailItem } from '@/lib/email/bookmark-template'
import { getReportSignedUrl } from '@/lib/contents/report-url'
import { createAdminClient } from '@/lib/supabase/admin'

const MAX_RECIPIENTS = 10
const MAX_ATTACHMENT_BYTES = 8 * 1024 * 1024 // 8MB (Resend 제한 40MB, 여유분)
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function categorizeSendError(err: { name?: string; message?: string }): string {
  const msg = (err.message ?? '').toLowerCase()
  const name = (err.name ?? '').toLowerCase()

  if (name === 'missing_required_field') {
    return '이메일 발송 설정이 완료되지 않았습니다. 관리자에게 환경변수(RESEND_FROM_EMAIL) 설정을 요청하세요.'
  }
  if (msg.includes('from') || msg.includes('domain')) {
    return '발신 도메인이 검증되지 않았습니다. 관리자에게 Resend 도메인 검증을 요청하세요.'
  }
  if (msg.includes('not allowed') || msg.includes('unauthorized') || msg.includes('forbidden')) {
    return '발신 권한이 없습니다. 발신 도메인 검증(Resend) 후 이용 가능합니다.'
  }
  if (msg.includes('invalid') && msg.includes('email')) {
    return '수신 이메일 주소가 올바르지 않습니다.'
  }
  if (msg.includes('blocked') || msg.includes('bounce') || msg.includes('suppressed')) {
    return '수신 거부 또는 반송 이력이 있는 이메일 주소입니다.'
  }
  if (msg.includes('rate') || msg.includes('limit')) {
    return '발송 한도에 도달했습니다. 잠시 후 다시 시도해주세요.'
  }
  return '이메일 발송에 실패했습니다. 잠시 후 다시 시도해주세요.'
}

function sanitizeFileName(name: string): string {
  return name.replace(/[<>:"/\\|?*\x00-\x1F]/g, '_').slice(0, 100)
}

interface BookmarkJoinRow {
  contents: {
    id: string
    title: string
    category: string
    summary_ko: string | null
    original_url: string | null
    file_path: string | null
    published_at: string | null
    deleted_at: string | null
    sources: { name: string } | null
  } | null
  youtube_videos: {
    id: string
    video_id: string
    title: string
    channel_name: string
    published_at: string | null
  } | null
  ai_reports: {
    id: string
    title: string
    type: string
    published_at: string | null
  } | null
  daily_insights: {
    id: string
    headline: string
    summary_ko: string | null
    category: string | null
    day_of: string
  } | null
  insight_cards: {
    id: string
    topic: string
    headline: string
    card_headline: string | null
    implication: string | null
    generated_at: string | null
  } | null
}

export async function POST(req: NextRequest) {
  try {
    if (!process.env.RESEND_FROM_EMAIL) {
      console.warn('[send-bookmarks] RESEND_FROM_EMAIL 미설정 — Resend 발신 도메인 인증 후 설정 필요')
    }

    // ── 1. 인증 ──────────────────────────────────────────────────────────
    const cookieStore = await cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() { return cookieStore.getAll() },
          setAll(toSet) {
            toSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
          },
        },
      }
    )

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })
    }

    // ── 2. 요청 파싱 + 수신자 검증 ───────────────────────────────────────
    const body = (await req.json()) as { bookmarkIds?: unknown; recipients?: string[] }
    const bookmarkIds = Array.isArray(body.bookmarkIds)
      ? [...new Set(body.bookmarkIds.filter((id): id is string => typeof id === 'string' && id.length > 0))]
      : []
    if (bookmarkIds.length === 0) {
      return NextResponse.json({ error: 'bookmarkIds 가 필요합니다.' }, { status: 400 })
    }

    let recipientList: string[] = []
    if (body.recipients && body.recipients.length > 0) {
      const raw = body.recipients
        .flatMap((r: string) => r.split(/[,;\s]+/))
        .map((e: string) => e.trim().toLowerCase())
        .filter(Boolean)
      const unique = [...new Set(raw)]
      const invalid = unique.filter((e) => !EMAIL_RE.test(e))
      if (invalid.length > 0) {
        return NextResponse.json({ error: `올바르지 않은 이메일 주소: ${invalid.join(', ')}` }, { status: 400 })
      }
      if (unique.length > MAX_RECIPIENTS) {
        return NextResponse.json({ error: `수신자는 최대 ${MAX_RECIPIENTS}명까지 가능합니다.` }, { status: 400 })
      }
      recipientList = unique
    }

    // ── 3. 북마크 + 대상 조회 ─────────────────────────────────────────────
    // 517 — 아카이브 폐기로 "북마크 id 목록"이 직접 발송 단위가 된다. RLS 클라이언트라
    // user_id 필터 없이도 본인 것만 잡히지만, 명시적으로 한 번 더 잠근다.
    const { data: bookmarkRows, error: bookmarkErr } = await supabase
      .from('bookmarks')
      .select(`
        contents(id, title, category, summary_ko, original_url, file_path, published_at, deleted_at, sources(name)),
        youtube_videos(id, video_id, title, channel_name, published_at),
        ai_reports(id, title, type, published_at),
        daily_insights(id, headline, summary_ko, category, day_of),
        insight_cards(id, topic, headline, card_headline, implication, generated_at)
      `)
      .in('id', bookmarkIds)
      .eq('user_id', user.id)

    if (bookmarkErr) {
      console.error('[send-bookmarks] 조회 오류:', bookmarkErr)
      return NextResponse.json({ error: '북마크를 불러오지 못했습니다.' }, { status: 500 })
    }
    if (!bookmarkRows || bookmarkRows.length === 0) {
      return NextResponse.json({ error: '북마크를 찾을 수 없습니다.' }, { status: 404 })
    }

    // ── 4. 수신자 결정 ───────────────────────────────────────────────────
    const [{ data: userProfile }, { data: newsletterSub }] = await Promise.all([
      supabase.from('users').select('name').eq('id', user.id).single(),
      supabase
        .from('newsletter_subscriptions')
        .select('newsletter_email')
        .eq('user_id', user.id)
        .single(),
    ])

    if (recipientList.length === 0) {
      const fallback = newsletterSub?.newsletter_email ?? user.email
      if (!fallback) {
        return NextResponse.json({ error: '수신 이메일을 찾을 수 없습니다.' }, { status: 400 })
      }
      recipientList = [fallback]
    }

    // ── 5. 이메일 항목 빌드 + PDF 첨부 준비 ──────────────────────────────
    const items: BookmarkEmailItem[] = []
    const attachments: ResendAttachment[] = []
    let totalAttachmentSize = 0

    const siteBaseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://insight-out-app.vercel.app'

    for (const row of bookmarkRows as unknown as BookmarkJoinRow[]) {
      // 492 · 3단계 D — SQL B(RLS) 적용 전에는 소프트 삭제된 콘텐츠도 그대로 조회될 수 있어 명시적으로 건너뛴다.
      const content = row.contents && !row.contents.deleted_at ? row.contents : null

      if (content) {
        let reportSignedUrl: string | null = null
        let isAttached = false

        if (content.file_path) {
          const admin = createAdminClient()
          const { data: fileData } = await admin.storage
            .from('reports')
            .download(content.file_path)

          if (fileData && totalAttachmentSize + fileData.size <= MAX_ATTACHMENT_BYTES) {
            const buffer = Buffer.from(await fileData.arrayBuffer())
            totalAttachmentSize += buffer.length
            attachments.push({
              content: buffer.toString('base64'),
              name: `${sanitizeFileName(content.title)}.pdf`,
            })
            isAttached = true
          } else {
            reportSignedUrl = await getReportSignedUrl(content.file_path)
          }
        }

        items.push({
          title: content.title,
          category: content.category,
          sourceName: content.sources?.name ?? null,
          publishedAt: content.published_at ?? null,
          summaryKo: content.summary_ko ?? null,
          originalUrl: content.original_url ?? null,
          reportSignedUrl,
          isAttached,
        })
        continue
      }

      if (row.ai_reports) {
        items.push({
          title: row.ai_reports.title,
          category: `AI 리포트 · ${row.ai_reports.type}`,
          sourceName: null,
          publishedAt: row.ai_reports.published_at ?? null,
          summaryKo: null,
          originalUrl: `${siteBaseUrl}/dashboard/reports/${row.ai_reports.id}`,
          reportSignedUrl: null,
          isAttached: false,
        })
        continue
      }

      if (row.daily_insights) {
        items.push({
          title: row.daily_insights.headline,
          category: row.daily_insights.category ?? '핵심 인사이트',
          sourceName: null,
          publishedAt: row.daily_insights.day_of,
          summaryKo: row.daily_insights.summary_ko,
          originalUrl: `${siteBaseUrl}/dashboard/daily-insights/${row.daily_insights.id}`,
          reportSignedUrl: null,
          isAttached: false,
        })
        continue
      }

      if (row.insight_cards) {
        items.push({
          title: row.insight_cards.card_headline ?? row.insight_cards.headline,
          category: `인사이트 카드 · ${row.insight_cards.topic}`,
          sourceName: null,
          publishedAt: row.insight_cards.generated_at,
          summaryKo: row.insight_cards.implication,
          originalUrl: `${siteBaseUrl}/dashboard/insights/${row.insight_cards.id}`,
          reportSignedUrl: null,
          isAttached: false,
        })
        continue
      }

      if (row.youtube_videos) {
        items.push({
          title: row.youtube_videos.title,
          category: '유튜브',
          sourceName: row.youtube_videos.channel_name,
          publishedAt: row.youtube_videos.published_at,
          summaryKo: null,
          originalUrl: `https://www.youtube.com/watch?v=${row.youtube_videos.video_id}`,
          reportSignedUrl: null,
          isAttached: false,
        })
      }
      // 다섯 대상 전부 없으면(삭제된 콘텐츠 등) 조용히 건너뛴다.
    }

    if (items.length === 0) {
      return NextResponse.json({ error: '발송할 콘텐츠가 없습니다.' }, { status: 400 })
    }

    // ── 6. Resend 발송 ─────────────────────────────────────────────────────
    const html = buildBookmarkEmailHtml({
      recipientName: userProfile?.name ?? '사용자',
      items,
    })

    try {
      await sendResendEmail({
        to: recipientList,
        subject: `[Insight Out] 북마크 — ${items.length}건의 인사이트`,
        html,
        attachments: attachments.length > 0 ? attachments : undefined,
      })
    } catch (err) {
      const norm = normalizeResendError(err)
      console.error('[send-bookmarks] Resend 발송 실패 | name=%s | message=%s', norm.name, norm.message)
      return NextResponse.json({ error: categorizeSendError(norm) }, { status: 500 })
    }

    return NextResponse.json({ success: true, to: recipientList.join(', '), count: items.length })

  } catch (err) {
    console.error('[send-bookmarks] 예상치 못한 오류:', err)
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 })
  }
}
