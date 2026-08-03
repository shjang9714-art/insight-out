import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { sendBrevoEmail, normalizeBrevoError, type BrevoAttachment } from '@/lib/email/brevo'
import { buildArchiveEmailHtml, type ArchiveEmailItem } from '@/lib/email/archive-template'
import { getReportSignedUrl } from '@/lib/contents/report-url'
import { createAdminClient } from '@/lib/supabase/admin'

const MAX_RECIPIENTS = 10
const MAX_ATTACHMENT_BYTES = 8 * 1024 * 1024 // 8MB (Brevo 제한 ~10MB, 여유분)
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function categorizeSendError(err: { name?: string; message?: string }): string {
  const msg = (err.message ?? '').toLowerCase()
  const name = (err.name ?? '').toLowerCase()

  if (name === 'missing_required_field') {
    return '이메일 발송 설정이 완료되지 않았습니다. 관리자에게 환경변수(BREVO_FROM_EMAIL) 설정을 요청하세요.'
  }
  if (msg.includes('from') || msg.includes('domain')) {
    return '발신 도메인이 검증되지 않았습니다. 관리자에게 Brevo 도메인 검증을 요청하세요.'
  }
  if (msg.includes('not allowed') || msg.includes('unauthorized') || msg.includes('forbidden')) {
    return '발신 권한이 없습니다. 발신 도메인 검증(Brevo) 후 이용 가능합니다.'
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

export async function POST(req: NextRequest) {
  try {
    if (!process.env.BREVO_FROM_EMAIL) {
      console.warn('[send-archive] BREVO_FROM_EMAIL 미설정 — Brevo 발신 도메인 인증 후 설정 필요')
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
    const body = (await req.json()) as { archiveId: string; recipients?: string[] }
    const { archiveId } = body
    if (!archiveId) {
      return NextResponse.json({ error: 'archiveId 가 필요합니다.' }, { status: 400 })
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

    // ── 3. 아카이브 + 항목 조회 ───────────────────────────────────────────
    const { data: archive, error: archiveErr } = await supabase
      .from('archives')
      .select(`
        id, name,
        archive_items(
          content_id, youtube_video_id, ai_report_id,
          contents(id, title, category, summary_ko, original_url, file_path, published_at, sources(name)),
          ai_reports(id, title, type, published_at)
        )
      `)
      .eq('id', archiveId)
      .eq('user_id', user.id)
      .single()

    if (archiveErr || !archive) {
      return NextResponse.json({ error: '아카이브를 찾을 수 없습니다.' }, { status: 404 })
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
    const items: ArchiveEmailItem[] = []
    const attachments: BrevoAttachment[] = []
    let totalAttachmentSize = 0

    const siteBaseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://insight-out-app.vercel.app'

    for (const archiveItem of archive.archive_items as unknown as {
      content_id: string | null
      youtube_video_id: string | null
      ai_report_id: string | null
      contents: {
        id: string
        title: string
        category: string
        summary_ko: string | null
        original_url: string | null
        file_path: string | null
        published_at: string | null
        sources: { name: string } | null
      } | null
      ai_reports: {
        id: string
        title: string
        type: string
        published_at: string | null
      } | null
    }[]) {
      const content = archiveItem.contents

      if (!content) {
        // 리포트 항목 — 본문(contents)이 없으므로 제목+링크만으로 카드 구성
        const report = archiveItem.ai_reports
        if (!report) continue // 삭제/미발행 리포트 — 스킵

        items.push({
          title: report.title,
          category: `AI 리포트 · ${report.type}`,
          sourceName: null,
          publishedAt: report.published_at ?? null,
          summaryKo: null,
          originalUrl: `${siteBaseUrl}/dashboard/reports/${report.id}`,
          reportSignedUrl: null,
          isAttached: false,
        })
        continue
      }

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
    }

    if (items.length === 0) {
      return NextResponse.json({ error: '발송할 콘텐츠가 없습니다.' }, { status: 400 })
    }

    // ── 6. Brevo 발송 ──────────────────────────────────────────────────────
    const html = buildArchiveEmailHtml({
      archiveName: archive.name,
      recipientName: userProfile?.name ?? '사용자',
      items,
    })

    try {
      await sendBrevoEmail({
        to: recipientList,
        subject: `[Insight Out] ${archive.name} — ${items.length}건의 인사이트`,
        html,
        attachments: attachments.length > 0 ? attachments : undefined,
      })
    } catch (err) {
      const norm = normalizeBrevoError(err)
      console.error('[send-archive] Brevo 발송 실패 | name=%s | message=%s', norm.name, norm.message)
      return NextResponse.json({ error: categorizeSendError(norm) }, { status: 500 })
    }

    return NextResponse.json({ success: true, to: recipientList.join(', '), count: items.length })

  } catch (err) {
    console.error('[send-archive] 예상치 못한 오류:', err)
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 })
  }
}
