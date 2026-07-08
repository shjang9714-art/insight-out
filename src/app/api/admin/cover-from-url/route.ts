import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse, type NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { copyExternalImageToCover } from '@/lib/contents/cover-from-image'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * POST /api/admin/cover-from-url
 *
 * 관리자 전용 — 외부 이미지 URL(og:image 등)을 서버에서 fetch 해
 * report-covers 버킷으로 복사하고 contents.thumbnail_url 을 갱신한다.
 * 외부 URL을 그대로 저장(핫링크)하지 않기 위한 서버 복사 경로(216).
 *
 * body: { contentId: string, imageUrl: string }
 */
export async function POST(request: NextRequest) {
  // ─── 1. 인증 + 관리자 확인 ─────────────────────────────────────────────────

  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          )
        },
      },
    }
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

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

  // ─── 2. 요청 파싱 ─────────────────────────────────────────────────────────

  let body: { contentId?: string; imageUrl?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: '요청 형식이 올바르지 않습니다.' }, { status: 400 })
  }

  const { contentId, imageUrl } = body
  if (!contentId || !imageUrl) {
    return NextResponse.json({ error: '필수 파라미터가 없습니다.' }, { status: 400 })
  }

  try {
    new URL(imageUrl)
  } catch {
    return NextResponse.json({ error: '올바른 이미지 URL이 아닙니다.' }, { status: 400 })
  }

  // ─── 3. service_role 로 fetch→업로드→thumbnail_url 갱신(216·219 공유 헬퍼) ──

  let admin: ReturnType<typeof createAdminClient>
  try {
    admin = createAdminClient()
  } catch (err) {
    console.error('[api/admin/cover-from-url] 서버 설정 오류:', err)
    return NextResponse.json(
      { error: '서버 설정 오류입니다. 관리자에게 문의하세요.' },
      { status: 500 }
    )
  }

  const thumbnailUrl = await copyExternalImageToCover(admin, contentId, imageUrl)
  if (!thumbnailUrl) {
    return NextResponse.json({ error: '이미지를 가져오지 못했습니다.' }, { status: 502 })
  }

  return NextResponse.json({ thumbnailUrl })
}
