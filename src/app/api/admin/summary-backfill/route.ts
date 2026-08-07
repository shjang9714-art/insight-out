import { verifyAdminRequest } from '@/lib/admin/verify-admin-request'
import { NextResponse, type NextRequest } from 'next/server'
import { drainSummaries } from '@/lib/contents/summarize-backfill'
import { JobAlreadyRunningError, runJob } from '@/lib/jobs/run-job'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300


/**
 * POST /api/admin/summary-backfill?limit=N
 * summary_ko IS NULL 인 published 콘텐츠를 요약 (단일 배치).
 * limit: 1~30, 기본 20.
 */
export async function POST(request: NextRequest) {
  const gate = await verifyAdminRequest()
  if (!gate.ok) return gate.response

  const sp = request.nextUrl.searchParams
  const limitParam = sp.get('limit')
  const limit = Math.min(Math.max(parseInt(limitParam || '20', 10) || 20, 1), 30)

  const admin = gate.admin
  let result
  try {
    result = await runJob(admin, { key: 'admin:summary-backfill', trigger: 'admin', startedBy: gate.userId }, () =>
      drainSummaries(admin, { limit }), { rejectIfRunning: true })
  } catch (error) {
    if (error instanceof JobAlreadyRunningError) return NextResponse.json({ error: error.message }, { status: 409 })
    throw error
  }

  if (result.remaining === -1) {
    return NextResponse.json(
      {
        error: result.error ?? 'summary_attempted_at 컬럼이 아직 적용되지 않았습니다. SQL 295 적용이 필요합니다.',
      },
      { status: 503 },
    )
  }

  return NextResponse.json(result)
}
