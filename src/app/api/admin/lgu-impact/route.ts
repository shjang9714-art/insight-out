import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { createAdminClient } from '@/lib/supabase/admin'
import { backfillLguImpact } from '@/lib/insight/lgu-impact-backfill'
import { runJob } from '@/lib/jobs/run-job'

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
    return { error: NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 }), userId: null }
  }

  const { data: profile } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!profile || profile.role !== 'admin') {
    return { error: NextResponse.json({ error: '관리자 권한이 필요합니다.' }, { status: 403 }), userId: null }
  }

  return { error: null, userId: user.id }
}

/**
 * POST /api/admin/lgu-impact
 * body: { days?: number (기본 14), max?: number (기본 40, 상한 100) }
 * 경쟁사 기사 lgu_impact(LG U+ 관점 위기/기회/관망) 백필 트리거
 */
export async function POST(request: NextRequest) {
  try {
    const { error: authError, userId } = await verifyAdmin()
    if (authError) return authError

    let days = 14
    let max = 40
    try {
      const body = await request.json() as Record<string, unknown>
      if (typeof body.days === 'number' && body.days > 0) days = body.days
      if (typeof body.max === 'number' && body.max > 0) max = Math.min(body.max, 100)
    } catch { /* body 파싱 실패 시 기본값 사용 */ }

    const supabase = createAdminClient()
    const result = await runJob(supabase, { key: 'admin:lgu-impact', trigger: 'admin', startedBy: userId ?? undefined }, () =>
      backfillLguImpact(supabase, { days, max })
    )
    return NextResponse.json(result)
  } catch (err) {
    console.error('[lgu-impact backfill]', err)
    return NextResponse.json({ error: '위기·기회 분석 중 오류가 발생했습니다.' }, { status: 500 })
  }
}
