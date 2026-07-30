import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse, type NextRequest } from 'next/server'
import { summarizeKo } from '@/lib/crawler/summarize'
import { stripMarkdown } from '@/lib/contents/clean-body'

// ─── HTML 정리 ───────────────────────────────────────────────────────────────

function cleanHtml(raw: string): string {
  return raw
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

// ─── POST /api/admin/paste ────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  // ─── 인증 + 관리자 확인 ──────────────────────────────────────────────────

  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(cs) { cs.forEach(({ name, value, options }) => cookieStore.set(name, value, options)) },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })
  }

  const { data: profile } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'admin') {
    return NextResponse.json({ error: '관리자 권한이 필요합니다.' }, { status: 403 })
  }

  // ─── 요청 파싱 ───────────────────────────────────────────────────────────

  let body: {
    category?: string
    title?: string
    bodyText?: string
    bodyMarkdown?: string
    originalUrl?: string | null
    summary?: string | null
    author?: string | null
    publishedAt?: string | null
    sourceId?: string | null
    keywords?: string[]
  }

  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: '요청 형식이 올바르지 않습니다.' }, { status: 400 })
  }

  const { category, title, bodyText, bodyMarkdown, originalUrl, summary, author, publishedAt, sourceId, keywords = [] } = body

  if (!title?.trim()) {
    return NextResponse.json({ error: '제목을 입력해주세요.' }, { status: 400 })
  }
  if (!bodyText?.trim()) {
    return NextResponse.json({ error: '본문을 입력해주세요.' }, { status: 400 })
  }

  // ─── 본문 정리 — 212: 마크다운 있으면 stripMarkdown(평문화), 없으면 기존 HTML 정리 ──

  const cleanBody = bodyMarkdown?.trim() ? stripMarkdown(bodyMarkdown) : cleanHtml(bodyText)

  // ─── 요약 생성 (best-effort) ─────────────────────────────────────────────

  let summaryKo: string | null = summary?.trim() || null
  if (!summaryKo) {
    summaryKo = (await summarizeKo(title.trim(), cleanBody)).text
  }

  // ─── contents insert ─────────────────────────────────────────────────────

  const insertPayload: Record<string, unknown> = {
    category:          category ?? '웹인사이트',
    title:             title.trim(),
    body_original:     cleanBody,
    original_url:      originalUrl || null,
    summary_ko:        summaryKo,
    author:            author || null,
    published_at:      publishedAt || null,
    source_id:         sourceId || null,
    file_path:         null,
    original_language: 'ko',
    status:            'published',
  }
  const hasMarkdown = Boolean(bodyMarkdown?.trim())
  if (hasMarkdown) insertPayload.body_markdown = bodyMarkdown

  let { data: contentRow, error: contentErr } = await supabase
    .from('contents')
    .insert(insertPayload)
    .select('id')
    .single()

  // 212 — body_markdown 컬럼 미적용(42703) graceful: 컬럼 없이 재시도
  if (contentErr?.code === '42703' && hasMarkdown) {
    delete insertPayload.body_markdown
    ;({ data: contentRow, error: contentErr } = await supabase
      .from('contents')
      .insert(insertPayload)
      .select('id')
      .single())
  }

  if (contentErr || !contentRow) {
    // original_url 부분 유니크 인덱스 위반
    if (contentErr?.code === '23505' && originalUrl) {
      return NextResponse.json({ error: '이미 등록된 원문 URL 입니다.' }, { status: 409 })
    }
    console.error('[api/admin/paste] contents insert 실패:', contentErr)
    return NextResponse.json({ error: '콘텐츠 저장에 실패했습니다.' }, { status: 500 })
  }

  const contentId = contentRow.id

  // ─── keywords: 조회/생성 → content_keywords ──────────────────────────────

  if (keywords.length > 0) {
    const kwIds: string[] = []
    for (const kw of keywords) {
      const { data: existing } = await supabase
        .from('keywords')
        .select('id')
        .ilike('name', kw)
        .maybeSingle()

      if (existing) {
        kwIds.push(existing.id)
      } else {
        const { data: created, error: kwErr } = await supabase
          .from('keywords')
          .insert({ name: kw })
          .select('id')
          .single()
        if (kwErr) {
          console.error(`[api/admin/paste] 키워드 생성 실패 (${kw}):`, kwErr)
          continue
        }
        kwIds.push(created.id)
      }
    }

    if (kwIds.length > 0) {
      const ckRows = kwIds.map((kid: string) => ({ content_id: contentId, keyword_id: kid }))
      const { error: ckErr } = await supabase.from('content_keywords').insert(ckRows)
      if (ckErr) {
        console.error('[api/admin/paste] content_keywords insert 실패:', ckErr)
      }
    }
  }

  return NextResponse.json({ id: contentId })
}
