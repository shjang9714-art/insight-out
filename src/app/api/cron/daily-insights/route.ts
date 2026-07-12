import type { NextRequest } from 'next/server'
import { generateDailyInsightBatch } from '@/lib/daily-insights/generate'
import { createAdminClient } from '@/lib/supabase/admin'
import { runJob } from '@/lib/jobs/run-job'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
// 그룹(최대 3개)당 순차 LLM 호출 — completeWithRetry 재시도·provider 폴백 캐스케이드가
// 그룹마다 겹치면 시간이 걸릴 수 있어 key-insights 크론과 동일하게 300초로 확보.
export const maxDuration = 300

/**
 * 핵심 Insight 일일 종합 인사이트 — 매일 실행, 요일 게이트 없음(주간 파이프라인과 분리).
 * 자동게시 + 사후검토(needs_review) 방침이라 별도 검수 게이트도 없다.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return Response.json({ ok: false, error: '인증 실패' }, { status: 401 })
  }

  try {
    const admin = createAdminClient()
    const result = await runJob(admin, { key: 'cron:daily-insights', trigger: 'cron' }, async () => {
      return generateDailyInsightBatch()
    })
    return Response.json(result)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[크론/daily-insights] ${new Date().toISOString()} 생성 오류:`, message)
    return Response.json(
      {
        ok: false,
        generated: 0,
        skipped: false,
        failed: true,
        errorReason: message,
        error: '일일 핵심 Insight 생성 중 오류가 발생했습니다.',
        detail: message,
      },
      { status: 500 }
    )
  }
}
