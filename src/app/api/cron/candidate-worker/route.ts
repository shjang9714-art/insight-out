import type { NextRequest } from 'next/server'
import { runCandidateWorker } from '@/lib/ingestion/candidate-worker'
import { createAdminClient } from '@/lib/supabase/admin'
import { runJob } from '@/lib/jobs/run-job'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

/**
 * GET /api/cron/candidate-worker
 *
 * Candidate Queue에서 후보를 점유해 원문 URL 확인·본문 추출·품질 검사를 거쳐 contents에 저장합니다.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return Response.json({ ok: false, error: '인증 실패' }, { status: 401 })
  }

  try {
    const limitParam = Number(request.nextUrl.searchParams.get('limit'))
    const limit = Number.isFinite(limitParam) && limitParam > 0
      ? Math.floor(limitParam)
      : 30
    const admin = createAdminClient()
    const result = await runJob(
      admin,
      { key: 'cron:candidate-worker', trigger: 'cron' },
      () => runCandidateWorker({
        limit,
        deadline: Date.now() + 270_000,
      }),
    )
    return Response.json(result)
  } catch (error) {
    console.error('[크론/candidate-worker] 기사 후보 처리 오류:', error)
    return Response.json(
      {
        ok: false,
        error: '기사 후보 처리 중 오류가 발생했습니다.',
        detail: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    )
  }
}
