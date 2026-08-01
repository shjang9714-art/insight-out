import { verifyAdminRequest } from '@/lib/admin/verify-admin-request'
import { NextResponse, type NextRequest } from 'next/server'
import { drainClusterBackfill } from '@/lib/crawler/cluster-backfill'
import { runJob } from '@/lib/jobs/run-job'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300


/**
 * POST /api/admin/cluster-backfill?limit=N&from=YYYY-MM-DD&to=YYYY-MM-DD
 * 뉴스 중 cluster_checked_at IS NULL·body_fetched_at IS NOT NULL 대상으로
 * 본문 유사도 재클러스터링(단일 배치). limit: 1~30, 기본 20.
 * cluster_checked_at 컬럼 미적용(42703) 시 { ready: false }(220 SQL 적용 필요).
 */
export async function POST(request: NextRequest) {
  const gate = await verifyAdminRequest()
  if (!gate.ok) return gate.response

  const sp = request.nextUrl.searchParams
  const limitParam = sp.get('limit')
  const limit = Math.min(Math.max(parseInt(limitParam || '20', 10) || 20, 1), 30)
  const from = sp.get('from')
  const to = sp.get('to')

  const admin = gate.admin
  const result = await runJob(admin, { key: 'admin:cluster-backfill', trigger: 'admin', startedBy: gate.userId }, () =>
    drainClusterBackfill(admin, { limit, from, to })
  )
  return NextResponse.json(result)
}
