import type { NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { drainSummaries } from '@/lib/contents/summarize-backfill'
import { runJob } from '@/lib/jobs/run-job'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

/**
 * GET /api/cron/summary-backfill
 *
 * Vercel Cron 이 매일 KST 05:20 (UTC 20:20, 크롤 직후) 에 호출.
 * 270초 시간상자 안에서 summary_ko IS NULL AND status='published' 전체를 20건씩 드레인.
 *
 * 크롤(/api/cron/crawl)에서 요약(LLM) 생성을 분리한 결과물 — 크롤이 Gemini 등
 * LLM 프로바이더 한도/재시도에 시간 예산을 뺏겨 60초 타임아웃(504)나는 문제를
 * 막기 위해, 요약은 별도 시간상자(300초)를 가진 이 크론이 전담한다.
 * (지시서_20260712_크롤-요약분리-타임아웃해결.md)
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return Response.json({ ok: false, error: '인증 실패' }, { status: 401 })
  }

  try {
    const admin = createAdminClient()
    const result = await runJob(admin, { key: 'cron:summary-backfill', trigger: 'cron' }, async () => {
      const r = await drainSummaries(admin, {
        limit: 20,
        deadline: Date.now() + 270_000,
      })
      // 한도소진은 실패가 아니라 정상적인 한도 도달 — job_runs 에 'skipped' 로 기록되도록
      // (runJob 은 result.skipped 가 숫자가 아니면서 truthy 일 때만 skipped 판정한다) notReady 건수 대신 표시.
      if (r.rateLimited) return { ok: true, ...r, skipped: 'rate_limited' as const }
      return { ok: true, ...r }
    })
    return Response.json(result)
  } catch (err) {
    console.error('[크론/summary-backfill] 오류:', err)
    const detail = err instanceof Error ? err.message : String(err)
    return Response.json(
      { ok: false, error: '요약 백필 중 오류가 발생했습니다.', detail },
      { status: 500 },
    )
  }
}
