import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

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
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!profile || profile.role !== 'admin') {
    return NextResponse.json({ error: '관리자 권한이 필요합니다.' }, { status: 403 })
  }

  return null
}

/** GET — 크롤링 기사 건수 미리보기 */
export async function GET() {
  try {
    const authError = await verifyAdmin()
    if (authError) return authError

    const admin = createAdminClient()
    const { count, error } = await admin
      .from('contents')
      .select('id', { count: 'exact', head: true })
      .not('original_url', 'is', null)

    if (error) throw error
    return NextResponse.json({ count: count ?? 0 })
  } catch (err) {
    console.error('[/api/admin/contents/purge] GET 오류:', err)
    return NextResponse.json({ error: '건수 조회 중 오류가 발생했습니다.' }, { status: 500 })
  }
}

/** POST — 크롤링 기사 전체 삭제 (original_url IS NOT NULL). FK cascade로 연관행 자동 정리. */
export async function POST() {
  try {
    const authError = await verifyAdmin()
    if (authError) return authError

    const admin = createAdminClient()
    const { error, count } = await admin
      .from('contents')
      .delete({ count: 'exact' })
      .not('original_url', 'is', null)

    if (error) throw error
    return NextResponse.json({ deleted: count ?? 0 })
  } catch (err) {
    console.error('[/api/admin/contents/purge] POST 오류:', err)
    return NextResponse.json({ error: '삭제 중 오류가 발생했습니다.' }, { status: 500 })
  }
}
