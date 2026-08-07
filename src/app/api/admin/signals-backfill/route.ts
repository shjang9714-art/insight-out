import { verifyAdminRequest } from '@/lib/admin/verify-admin-request'
import { NextResponse, type NextRequest } from 'next/server'
import { drainSignals } from '@/lib/contents/classify-signals'
import { JobAlreadyRunningError, runJob } from '@/lib/jobs/run-job'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300


/**
 * POST /api/admin/signals-backfill?limit=N
 * signals_classified_at IS NULL 인 published 콘텐츠를 신호 분류 (단일 배치).
 * limit: 1~20, 기본 10.
 */
export async function POST(request: NextRequest) {
  const gate = await verifyAdminRequest()
  if (!gate.ok) return gate.response

  const sp = request.nextUrl.searchParams
  const limitParam = sp.get('limit')
  const limit = Math.min(Math.max(parseInt(limitParam || '10', 10) || 10, 1), 20)

  const admin = gate.admin
  let result
  try {
    result = await runJob(admin, { key: 'admin:signals-backfill', trigger: 'admin', startedBy: gate.userId }, () =>
      drainSignals(admin, { limit }), { rejectIfRunning: true })
  } catch (error) {
    if (error instanceof JobAlreadyRunningError) return NextResponse.json({ error: error.message }, { status: 409 })
    throw error
  }

  if (result.remaining === -1) {
    return NextResponse.json(
      {
        error:
          'signals_classified_at 컬럼이 아직 적용되지 않았습니다. 수희가 137-signals-classified-marker.sql을 실행한 후 사용 가능합니다.',
      },
      { status: 503 },
    )
  }

  return NextResponse.json(result)
}
