import { verifyAdminRequest } from '@/lib/admin/verify-admin-request'
import { NextResponse, type NextRequest } from 'next/server'
import { drainThumbnailBackfill } from '@/lib/contents/thumbnail-backfill'
import { JobAlreadyRunningError, runJob } from '@/lib/jobs/run-job'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300


/**
 * POST /api/admin/thumbnail-backfill?limit=N&from=YYYY-MM-DD&to=YYYY-MM-DD&mode=fresh|retry
 * 뉴스·웹인사이트 중 대상 행에 원문 og:image 재수집(단일 배치). limit: 1~30, 기본 20.
 * mode=fresh(기본): thumbnail_url·thumbnail_fetched_at 모두 NULL. mode=retry: 과거 실패행(thumbnail_fetched_at 있음)만 재대상.
 * thumbnail_fetched_at 컬럼 미적용(42703) 시 { ready: false }(219 SQL 적용 필요).
 */
export async function POST(request: NextRequest) {
  const gate = await verifyAdminRequest()
  if (!gate.ok) return gate.response

  const sp = request.nextUrl.searchParams
  const limitParam = sp.get('limit')
  const limit = Math.min(Math.max(parseInt(limitParam || '20', 10) || 20, 1), 30)
  const from = sp.get('from')
  const to = sp.get('to')
  const mode = sp.get('mode') === 'retry' ? 'retry' : 'fresh'

  const admin = gate.admin
  try {
    const result = await runJob(admin, { key: 'admin:thumbnail-backfill', trigger: 'admin', mode, startedBy: gate.userId }, () =>
      drainThumbnailBackfill(admin, { limit, from, to, mode }), { rejectIfRunning: true })
    return NextResponse.json(result)
  } catch (error) {
    if (error instanceof JobAlreadyRunningError) return NextResponse.json({ error: error.message }, { status: 409 })
    throw error
  }
}
