import { verifyAdminRequest } from '@/lib/admin/verify-admin-request'
import { NextResponse, type NextRequest } from 'next/server'
import { drainPdfCoverBackfill } from '@/lib/contents/pdf-cover-backfill'
import { runJob } from '@/lib/jobs/run-job'

// 네이티브 canvas(@napi-rs/canvas) 렌더 — edge 런타임 금지(285).
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300


/**
 * POST /api/admin/pdf-cover-backfill?limit=N&mode=fresh|retry
 * 업로드된 PDF(file_path 있음) 중 커버(thumbnail_url) 없는 것에 1페이지 표지 소급 적용(286).
 * limit: 1~10, 기본 5(렌더가 무거워 282 썸네일보다 작은 배치).
 * mode=fresh(기본): 아직 시도 안 함. mode=retry: 과거 실패행(thumbnail_fetched_at 있음)만 재대상.
 * thumbnail_fetched_at 컬럼 미적용(42703) 시 { ready: false }(219 SQL 적용 필요).
 */
export async function POST(request: NextRequest) {
  const gate = await verifyAdminRequest()
  if (!gate.ok) return gate.response

  const sp = request.nextUrl.searchParams
  const limitParam = sp.get('limit')
  const limit = Math.min(Math.max(parseInt(limitParam || '5', 10) || 5, 1), 10)
  const mode = sp.get('mode') === 'retry' ? 'retry' : 'fresh'

  const admin = gate.admin
  const result = await runJob(admin, { key: 'admin:pdf-cover-backfill', trigger: 'admin', mode, startedBy: gate.userId }, () =>
    drainPdfCoverBackfill(admin, { limit, mode })
  )
  return NextResponse.json(result)
}
