import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { Resend } from 'resend'
import { buildArchiveEmailHtml, type ArchiveEmailItem } from '@/lib/email/archive-template'
import { getReportSignedUrl } from '@/lib/contents/report-url'

export async function POST(req: NextRequest) {
  try {
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
      .eq('user_id', user.id)  // 본인 아카이브 확인
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

    // ── 6. Resend 발송 ─────────────────────────────────────────────────────
    const resend = new Resend(process.env.RESEND_API_KEY)

    const html = buildArchiveEmailHtml({
      archiveName: archive.name,
      recipientName: userProfile?.name ?? '사용자',
      items,
    })

    const { error: sendError } = await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL ?? 'onboarding@resend.dev',
      to: toEmail,
      subject: `[Insight Out] ${archive.name} — ${items.length}건의 인사이트`,
      html,
    })

    if (sendError) {
      console.error('[send-archive] Resend 오류:', sendError)
      return NextResponse.json({ error: '이메일 발송에 실패했습니다.' }, { status: 500 })
    }

    return NextResponse.json({ success: true, to: toEmail, count: items.length })

  } catch (err) {
    console.error('[send-archive] 예상치 못한 오류:', err)
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 })
  }
}
