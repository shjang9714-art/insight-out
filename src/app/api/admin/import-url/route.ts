import { NextResponse, type NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { extract } from '@extractus/article-extractor'
import { resolveArticleUrl } from '@/lib/crawler/resolve-url'
import { cleanBodyText, htmlToPlainText } from '@/lib/contents/clean-body'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

async function verifyAdmin() {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })
  }

  const { data: profile } = await supabase
    .from('users').select('role').eq('id', user.id).single()
  if (!profile || profile.role !== 'admin') {
    return NextResponse.json({ error: '관리자 권한이 필요합니다.' }, { status: 403 })
  }

  return null
}

/**
 * POST /api/admin/import-url
 * body: { url }
 * URL에서 제목·본문·저자·발행일을 추출해 콘텐츠 추가 폼 프리필용으로 반환.
 * 저장은 하지 않음(등록은 기존 /api/admin/paste 경로 재사용).
 */
export async function POST(request: NextRequest) {
  const authError = await verifyAdmin()
  if (authError) return authError

  let body: { url?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: '요청 형식이 올바르지 않습니다.' }, { status: 400 })
  }

  const url = body.url?.trim()
  if (!url) {
    return NextResponse.json({ error: 'URL을 입력해주세요.' }, { status: 400 })
  }

  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return NextResponse.json({ error: '올바른 URL 형식이 아닙니다.' }, { status: 400 })
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return NextResponse.json({ error: '올바른 URL 형식이 아닙니다.' }, { status: 400 })
  }

  try {
    const resolved = await resolveArticleUrl(url)
    const art = await extract(resolved, {}, { signal: AbortSignal.timeout(8000) })

    const title = art?.title ?? ''
    const bodyText = cleanBodyText(htmlToPlainText(art?.content ?? ''))

    if (!title.trim() && !bodyText.trim()) {
      return NextResponse.json(
        { error: '이 URL에서 본문을 추출하지 못했습니다. 직접 붙여넣기를 이용하세요.' },
        { status: 422 }
      )
    }

    return NextResponse.json({
      title,
      author: art?.author ?? '',
      bodyText,
      summary: art?.description ?? '',
      publishedAt: art?.published ? art.published.slice(0, 10) : '',
      originalUrl: resolved,
      thumbnailUrl: art?.image ?? '',
    })
  } catch (err) {
    console.error('[/api/admin/import-url] 추출 오류:', err)
    return NextResponse.json(
      { error: '이 URL에서 본문을 추출하지 못했습니다. 직접 붙여넣기를 이용하세요.' },
      { status: 422 }
    )
  }
}
