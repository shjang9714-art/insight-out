import { verifyAdminRequest } from '@/lib/admin/verify-admin-request'
import { NextResponse, type NextRequest } from 'next/server'
import { drainYoutubeTranscriptBackfill } from '@/lib/contents/youtube-transcript-backfill'
import { runJob } from '@/lib/jobs/run-job'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300


/**
 * POST /api/admin/youtube-transcript?limit=N&mode=fresh|retry
 * 유튜브(category='유튜브') 자막 수집·번역(단일 배치). limit: 1~20, 기본 10.
 * mode=fresh(기본): transcript_fetched_at 미시도. mode=retry: 과거 실패행(자막 없음/오류)만 재대상.
 * transcript_fetched_at 컬럼 미적용(42703) 시 { ready: false }(265 SQL 적용 필요).
 */
export async function POST(request: NextRequest) {
  const gate = await verifyAdminRequest()
  if (!gate.ok) return gate.response

  const sp = request.nextUrl.searchParams
  const limitParam = sp.get('limit')
  const limit = Math.min(Math.max(parseInt(limitParam || '10', 10) || 10, 1), 20)
  const mode = sp.get('mode') === 'retry' ? 'retry' : 'fresh'

  const admin = gate.admin
  const result = await runJob(admin, { key: 'admin:youtube-transcript', trigger: 'admin', mode, startedBy: gate.userId }, () =>
    drainYoutubeTranscriptBackfill(admin, { limit, mode })
  )
  return NextResponse.json(result)
}
