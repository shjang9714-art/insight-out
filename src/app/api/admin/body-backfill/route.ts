import { verifyAdminRequest } from '@/lib/admin/verify-admin-request'
import { NextResponse, type NextRequest } from 'next/server'
import { drainBackfill } from '@/lib/contents/enrich-body'
import { JobAlreadyRunningError, runJob } from '@/lib/jobs/run-job'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300


/**
 * POST /api/admin/body-backfill?limit=N&from=YYYY-MM-DD&to=YYYY-MM-DD
 * body_fetched_at IS NULL 대상으로 풀본문 백필 (단일 배치).
 * limit: 1~30, 기본 15. from/to: 선택적 수집일 범위 필터.
 */
export async function POST(request: NextRequest) {
  const gate = await verifyAdminRequest()
  if (!gate.ok) return gate.response

  const sp = request.nextUrl.searchParams
  const limitParam = sp.get('limit')
  const limit = Math.min(Math.max(parseInt(limitParam || '15', 10) || 15, 1), 30)
  const from = sp.get('from')
  const to = sp.get('to')

  const admin = gate.admin
  try {
    const result = await runJob(admin, { key: 'admin:body-backfill', trigger: 'admin', startedBy: gate.userId }, () =>
      drainBackfill(admin, { limit, from, to }), { rejectIfRunning: true })
    return NextResponse.json(result)
  } catch (error) {
    if (error instanceof JobAlreadyRunningError) return NextResponse.json({ error: error.message }, { status: 409 })
    throw error
  }
}
