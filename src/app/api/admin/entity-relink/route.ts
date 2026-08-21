import { verifyAdminRequest } from '@/lib/admin/verify-admin-request'
import { drainEntityRelink } from '@/lib/entities/relink-backfill'
import { JobAlreadyRunningError, runJob } from '@/lib/jobs/run-job'
import { NextResponse, type NextRequest } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

/** POST /api/admin/entity-relink?limit=N&from=YYYY-MM-DD&to=YYYY-MM-DD */
export async function POST(request: NextRequest) {
  const gate = await verifyAdminRequest()
  if (!gate.ok) return gate.response

  const searchParams = request.nextUrl.searchParams
  const requestedLimit = parseInt(searchParams.get('limit') || '200', 10) || 200
  const limit = Math.min(Math.max(requestedLimit, 1), 500)
  const from = searchParams.get('from')
  const to = searchParams.get('to')

  try {
    const result = await runJob(
      gate.admin,
      { key: 'admin:entity-relink', trigger: 'admin', startedBy: gate.userId },
      () => drainEntityRelink(gate.admin, { limit, from, to }),
      { rejectIfRunning: true },
    )
    return NextResponse.json(result)
  } catch (error) {
    if (error instanceof JobAlreadyRunningError) {
      return NextResponse.json({ error: error.message }, { status: 409 })
    }
    throw error
  }
}
