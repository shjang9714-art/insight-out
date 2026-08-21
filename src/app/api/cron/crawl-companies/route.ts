import type { NextRequest } from 'next/server'
import { runCrawl } from '@/lib/crawler/orchestrator'
import { runJob } from '@/lib/jobs/run-job'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

/** GET /api/cron/crawl-companies — 회사 seed 검색 전용 pg_cron 엔드포인트. */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return Response.json({ ok: false, error: '인증 실패' }, { status: 401 })
  }

  try {
    const admin = createAdminClient()
    const summary = await runJob(
      admin,
      { key: 'cron:crawl-companies', trigger: 'cron' },
      () => runCrawl({ phase: 'companies' })
    )
    return Response.json(summary)
  } catch (error) {
    console.error('[크론/crawl-companies] 회사 seed 크롤러 실행 오류:', error)
    const message = error instanceof Error ? error.message : String(error)
    return Response.json(
      { ok: false, error: '회사 seed 크롤러 실행 중 오류가 발생했습니다.', detail: message },
      { status: 500 }
    )
  }
}
