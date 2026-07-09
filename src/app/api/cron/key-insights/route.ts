import type { NextRequest } from 'next/server'
import { generateKeyInsightBatch, isThursdayKst } from '@/lib/key-insights/generate'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
// LLM 재시도(completeWithRetry)·provider 폴백 캐스케이드가 겹치면 실측 2분대까지 걸림
// (2026-07-09 수동 트리거 관측) — ai-refresh 등 다른 LLM cron과 동일하게 300초로 확보.
export const maxDuration = 300

/**
 * 매일 밤 실행되지만 실제 생성은 KST 목요일에만("주목하세요, 핵심 Insight" 주간 배치).
 * Vercel Hobby 플랜은 요일 지정 cron 표현식이 안 먹혀 vercel.json 은 매일 스케줄로 등록하고,
 * 이 라우트가 §3-3 요일 게이트로 실제 생성 여부를 가른다. force=1 이면 요일 게이트를 건너뛴다
 * (어드민 수동 트리거/테스트용 — generateKeyInsightBatch 자체의 멱등 가드는 이 경우에도 유지).
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return Response.json({ ok: false, error: '인증 실패' }, { status: 401 })
  }

  const force = request.nextUrl.searchParams.get('force') === '1'

  if (!force && !isThursdayKst()) {
    return Response.json({
      ok: true,
      generated: 0,
      skipped: true,
      failed: false,
      reason: '목요일 아님(KST) — 자동 실행 스킵',
    })
  }

  try {
    const result = await generateKeyInsightBatch({ force })
    const skipped = result.skipped === true
    const failed = !result.ok && !skipped

    return Response.json({
      ...result,
      weekOf: result.weekOf,
      generated: result.savedCount ?? 0,
      skipped,
      failed,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[크론/key-insights] ${new Date().toISOString()} 생성 오류:`, message)
    return Response.json(
      {
        ok: false,
        generated: 0,
        skipped: false,
        failed: true,
        errorReason: message,
        error: '핵심 Insight 생성 중 오류가 발생했습니다.',
        detail: message,
      },
      { status: 500 }
    )
  }
}
