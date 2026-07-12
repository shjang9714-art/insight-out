import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { createAdminClient } from '@/lib/supabase/admin'
import { generateCompetitorWeeklyReport } from '@/lib/competitor-weekly/generate'
import { runJob } from '@/lib/jobs/run-job'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

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
 * POST /api/admin/competitor-weekly
 * body: { weekStart?: string (YYYY-MM-DD, 월요일 — 미지정 시 최근 완결된 주) }
 * 주간 경쟁사 동향 리포트(261) 생성 트리거
 */
export async function POST(request: NextRequest) {
  try {
    const { error: authError, userId } = await verifyAdmin()
    if (authError) return authError

    let weekStart: string | undefined
    try {
      const body = await request.json() as Record<string, unknown>
      if (typeof body.weekStart === 'string' && body.weekStart) weekStart = body.weekStart
    } catch { /* body 없음 — 기본값(최근 완결된 주) 사용 */ }

    const admin = createAdminClient()
    const deadline = Date.now() + 270_000
    const result = await runJob(admin, { key: 'admin:competitor-weekly', trigger: 'admin', startedBy: userId ?? undefined }, () =>
      generateCompetitorWeeklyReport(admin, { weekStart, deadline })
    )
    return NextResponse.json(result)
  } catch (err) {
    console.error('[POST /api/admin/competitor-weekly] 오류:', err)
    return NextResponse.json(
      { error: '주간 경쟁 리포트 생성에 실패했습니다.' },
      { status: 500 }
    )
  }
}
