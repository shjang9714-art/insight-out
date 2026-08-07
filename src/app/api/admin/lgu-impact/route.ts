import { verifyAdminRequest } from '@/lib/admin/verify-admin-request'
import { NextRequest, NextResponse } from 'next/server'
import { backfillLguImpact } from '@/lib/insight/lgu-impact-backfill'
import { JobAlreadyRunningError, runJob } from '@/lib/jobs/run-job'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'


/**
 * POST /api/admin/lgu-impact
 * body: { days?: number (기본 14), max?: number (기본 40, 상한 100) }
 * 경쟁사 기사 lgu_impact(LG U+ 관점 위기/기회/관망) 백필 트리거
 */
export async function POST(request: NextRequest) {
  try {
    const gate = await verifyAdminRequest()
    if (!gate.ok) return gate.response

    let days = 14
    let max = 40
    try {
      const body = await request.json() as Record<string, unknown>
      if (typeof body.days === 'number' && body.days > 0) days = body.days
      if (typeof body.max === 'number' && body.max > 0) max = Math.min(body.max, 100)
    } catch { /* body 파싱 실패 시 기본값 사용 */ }

    const supabase = gate.admin
    const result = await runJob(supabase, { key: 'admin:lgu-impact', trigger: 'admin', startedBy: gate.userId }, () =>
      backfillLguImpact(supabase, { days, max }), { rejectIfRunning: true })
    return NextResponse.json(result)
  } catch (err) {
    if (err instanceof JobAlreadyRunningError) return NextResponse.json({ error: err.message }, { status: 409 })
    console.error('[lgu-impact backfill]', err)
    return NextResponse.json({ error: '위기·기회 분석 중 오류가 발생했습니다.' }, { status: 500 })
  }
}
