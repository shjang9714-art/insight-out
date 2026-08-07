import { verifyAdminRequest } from '@/lib/admin/verify-admin-request'
import { NextRequest, NextResponse } from 'next/server'
import { generateCompetitorWeeklyReport } from '@/lib/competitor-weekly/generate'
import { JobAlreadyRunningError, runJob } from '@/lib/jobs/run-job'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300


/**
 * POST /api/admin/competitor-weekly
 * body: { weekStart?: string (YYYY-MM-DD, 월요일 — 미지정 시 최근 완결된 주) }
 * 주간 경쟁사 동향 리포트(261) 생성 트리거
 */
export async function POST(request: NextRequest) {
  try {
    const gate = await verifyAdminRequest()
    if (!gate.ok) return gate.response

    let weekStart: string | undefined
    try {
      const body = await request.json() as Record<string, unknown>
      if (typeof body.weekStart === 'string' && body.weekStart) weekStart = body.weekStart
    } catch { /* body 없음 — 기본값(최근 완결된 주) 사용 */ }

    const admin = gate.admin
    const deadline = Date.now() + 270_000
    const result = await runJob(admin, { key: 'admin:competitor-weekly', trigger: 'admin', startedBy: gate.userId }, () =>
      generateCompetitorWeeklyReport(admin, { weekStart, deadline }), { rejectIfRunning: true })
    return NextResponse.json(result)
  } catch (err) {
    if (err instanceof JobAlreadyRunningError) return NextResponse.json({ error: err.message }, { status: 409 })
    console.error('[POST /api/admin/competitor-weekly] 오류:', err)
    return NextResponse.json(
      { error: '주간 경쟁 리포트 생성에 실패했습니다.' },
      { status: 500 }
    )
  }
}
