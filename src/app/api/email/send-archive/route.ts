import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { sendBrevoEmail, normalizeBrevoError } from '@/lib/email/brevo'
import { buildArchiveEmailHtml, type ArchiveEmailItem } from '@/lib/email/archive-template'
import { getReportSignedUrl } from '@/lib/contents/report-url'

// sendError.name/message → 사용자 노출 메시지로 카테고리화
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

export async function POST(req: NextRequest) {
  try {
    // ── 0. 발신자 환경변수 가드 ────────────────────────────────────────────
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

    // ── 2. 요청 파싱 ──────────────────────────────────────────────────────
    const { archiveId } = (await req.json()) as { archiveId: string }
    if (!archiveId) {
      return NextResponse.json({ error: 'archiveId 가 필요합니다.' }, { status: 400 })
    }

    // ── 3. 아카이브 + 항목 조회 ───────────────────────────────────────────
    const { data: archive, error: archiveErr } = await supabase
      .from('archives')
      .select(`
        id, name,
        archive_items(
          content_id, youtube_video_id,
          contents(id, title, category, summary_ko, original_url, file_path, published_at, sources(name))
        )
      `)
      .eq('id', archiveId)
      .eq('user_id', user.id)
      .single()

    if (archiveErr || !archive) {
      return NextResponse.json({ error: '아카이브를 찾을 수 없습니다.' }, { status: 404 })
    }

    // ── 4. 수신 이메일 결정 ───────────────────────────────────────────────
    const [{ data: userProfile }, { data: newsletterSub }] = await Promise.all([
      supabase.from('users').select('name').eq('id', user.id).single(),
      supabase
        .from('newsletter_subscriptions')
        .select('newsletter_email')
        .eq('user_id', user.id)
        .single(),
    ])

    const toEmail = newsletterSub?.newsletter_email ?? user.email
    if (!toEmail) {
      return NextResponse.json({ error: '수신 이메일을 찾을 수 없습니다.' }, { status: 400 })
    }

    // ── 5. 이메일 항목 빌드 ───────────────────────────────────────────────
    const items: ArchiveEmailItem[] = []

    for (const archiveItem of archive.archive_items as unknown as {
      content_id: string | null
      youtube_video_id: string | null
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
    }[]) {
      const content = archiveItem.contents
      if (!content) continue

      let reportSignedUrl: string | null = null
      if (content.file_path) {
        reportSignedUrl = await getReportSignedUrl(content.file_path)
      }

      items.push({
        title: content.title,
        category: content.category,
        sourceName: content.sources?.name ?? null,
        publishedAt: content.published_at ?? null,
        summaryKo: content.summary_ko ?? null,
        originalUrl: content.original_url ?? null,
        reportSignedUrl,
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
      await sendBrevoEmail({ to: toEmail, subject: `[Insight Out] ${archive.name} — ${items.length}건의 인사이트`, html })
    } catch (err) {
      const norm = normalizeBrevoError(err)
      // 수신자는 서버 로그에만 기록 (응답 본문 노출 금지)
      console.error('[send-archive] Brevo 발송 실패 | to=<hidden> | name=%s | message=%s', norm.name, norm.message)
      console.error('[send-archive] 수신자 도메인: %s', toEmail.split('@')[1] ?? 'unknown')
      return NextResponse.json({ error: categorizeSendError(norm) }, { status: 500 })
    }

    return NextResponse.json({ success: true, to: toEmail, count: items.length })

  } catch (err) {
    console.error('[send-archive] 예상치 못한 오류:', err)
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 })
  }
}
