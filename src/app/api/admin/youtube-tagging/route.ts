import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { createAdminClient } from '@/lib/supabase/admin'
import { backfillYoutubeTagging } from '@/lib/insight/youtube-tagging-backfill'

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
 * POST /api/admin/youtube-tagging
 * body: { max?: number (기본 100, 상한 300) }
 * 기존 유튜브 콘텐츠 분류(matched_groups/keywords)·엔티티 태깅 백필 트리거(252)
 */
export async function POST(request: NextRequest) {
  try {
    const { error: authError } = await verifyAdmin()
    if (authError) return authError

    let max = 100
    try {
      const body = await request.json() as Record<string, unknown>
      if (typeof body.max === 'number' && body.max > 0) max = Math.min(body.max, 300)
    } catch { /* body 파싱 실패 시 기본값 사용 */ }

    const supabase = createAdminClient()
    const result = await backfillYoutubeTagging(supabase, { max })
    return NextResponse.json(result)
  } catch (err) {
    console.error('[youtube-tagging backfill]', err)
    return NextResponse.json({ error: '유튜브 태깅 백필 중 오류가 발생했습니다.' }, { status: 500 })
  }
}
