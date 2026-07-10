import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { createAdminClient } from '@/lib/supabase/admin'
import { backfillYoutubeSummary } from '@/lib/insight/youtube-summary-backfill'

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
    return { error: NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 }) }
  }

  const { data: profile } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!profile || profile.role !== 'admin') {
    return { error: NextResponse.json({ error: '관리자 권한이 필요합니다.' }, { status: 403 }) }
  }

  return { error: null }
}

/**
 * POST /api/admin/youtube-summary
 * body: { max?: number (기본 50, 상한 200) }
 * summary_ko 없는 유튜브 콘텐츠에 제목+채널명 기반 요약 백필 트리거(266)
 */
export async function POST(request: NextRequest) {
  try {
    const { error: authError } = await verifyAdmin()
    if (authError) return authError

    let max = 50
    try {
      const body = await request.json() as Record<string, unknown>
      if (typeof body.max === 'number' && body.max > 0) max = Math.min(body.max, 200)
    } catch { /* body 파싱 실패 시 기본값 사용 */ }

    const supabase = createAdminClient()
    const result = await backfillYoutubeSummary(supabase, { max })
    return NextResponse.json(result)
  } catch (err) {
    console.error('[youtube-summary backfill]', err)
    return NextResponse.json({ error: '유튜브 요약 생성 중 오류가 발생했습니다.' }, { status: 500 })
  }
}
