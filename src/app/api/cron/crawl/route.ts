import type { NextRequest } from 'next/server'
import { revalidateTag } from 'next/cache'
import { runCrawl } from '@/lib/crawler/orchestrator'
import { createAdminClient } from '@/lib/supabase/admin'
import { runJob } from '@/lib/jobs/run-job'
import { fetchTrendingEvents } from '@/lib/issues/trending'
import { getKstDateString } from '@/lib/date'

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * 급상승 캐시 웜업 — revalidateTag(tag, 'max')는 "다음 방문"에 SWR로 백그라운드 재계산을
 * 걸 뿐, 그 방문 자체가 최신값을 받는다는 보장은 없다(낡은 값 먼저 반환 + 백그라운드
 * 갱신). 트래픽이 뜸한 새벽엔 그날 "첫 방문"이 실사용자일 수 있어, 그 사람이 낡은 화면을
 * 보게 된다(2026-07-15 사고 재발 방지의 핵심 — 여기가 없으면 revalidateTag만으론 부족).
 * 그래서 크롤 크론이 스스로 "첫 방문자" 역할을 대신한다 — 1차 호출로 백그라운드 재계산을
 * 트리거하고, 짧게 대기 후 재호출해 실제로 오늘로 갱신됐는지 확인한다. 크롤 크론은
 * maxDuration=300초라 몇 초 대기할 여유가 충분하다.
 */
async function warmTrendingCache(): Promise<void> {
  const today = getKstDateString()
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) await sleep(2000)
    try {
      const result = await fetchTrendingEvents()
      if (result?.asOfDateKst === today) return
      console.warn(
        `[크론/crawl] 급상승 캐시 웜업 시도 ${attempt + 1}/3 — 기준일 아직 "${result?.asOfDateKst}"(오늘 "${today}" 아님)`,
      )
    } catch (e) {
      console.error(`[크론/crawl] 급상승 캐시 웜업 시도 ${attempt + 1}/3 실패:`, e)
    }
  }
}

// Node.js 런타임 사용 (Edge 런타임은 crypto 모듈 미지원)
export const runtime = 'nodejs'
// 크론 라우트는 캐시 제외
export const dynamic = 'force-dynamic'
// body-backfill/signals-backfill 등 다른 크론과 동일하게 300초.
// 요약(LLM)을 크롤에서 뺀 뒤에도 키워드/회사 seed 검색(순차 처리, 아이템당 dedup 쿼리 최대 3회)만으로
// 210초 안팎이 걸려 60초로는 애초에 부족했음(2026-07-12 §5 재검증). runCrawl 내부에 소프트 데드라인이
// 있어 이 300초 안에서 우아하게 멈춘다 — 하드킬로 job_runs 미기록되는 사고를 방지.
export const maxDuration = 300

/**
 * GET /api/cron/crawl
 *
 * Vercel Cron 이 매일 KST 05:00 (UTC 20:00) 에 호출.
 * Vercel 은 CRON_SECRET 이 설정된 경우 Authorization: Bearer <CRON_SECRET> 헤더를 자동 첨부.
 * 외부 직접 호출 차단을 위해 반드시 인증 검증.
 */
export async function GET(request: NextRequest) {
  // 인증 검증
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return Response.json({ ok: false, error: '인증 실패' }, { status: 401 })
  }

  try {
    const admin = createAdminClient()
    const summary = await runJob(admin, { key: 'cron:crawl', trigger: 'cron' }, async () => {
      // 소급 수집(최초 구축·검증용): ?days=N (1~30). 미지정이면 당일분만.
      // 라우트가 CRON_SECRET 으로 인증되므로 인증된 호출자만 사용 가능.
      const daysParam = request.nextUrl.searchParams.get('days')
      const parsedDays = daysParam ? parseInt(daysParam, 10) : NaN
      const options = Number.isFinite(parsedDays) ? { backfillDays: parsedDays } : undefined

      return runCrawl(options)
    })

    // 급상승 캐시를 stale로 표시 — Next.js 16 revalidateTag(tag, 'max')는 SWR이라 "다음 방문"에
    // 백그라운드 재계산이지 즉시 동기 갱신은 아니지만, 크롤 완료 시점에 무효화해둬야 그 "다음
    // 방문"이 크롤 이전 낡은 캐시를 계속 재사용하는 걸 막는다(실측 2026-07-15 사고: 트래픽이
    // 뜸한 새벽~야간엔 자연 만료 20분 창이 하루 종일 안 걸릴 수 있음). 스냅샷 크론 자체는
    // 이 캐시를 아예 안 거치도록 별도 조치함(src/lib/issues/trending.ts computeTrendingEvents
    // 직접 호출, trending-snapshot/route.ts 참고).
    try {
      revalidateTag('trending-events', 'max')
      await warmTrendingCache()
    } catch (e) {
      console.error('[크론/crawl] 급상승 캐시 무효화/웜업 실패(무시하고 계속):', e)
    }

    return Response.json(summary)
  } catch (err) {
    // 이 라우트는 CRON_SECRET 으로 이미 인증됨(비밀키 보유자만 도달).
    // Vercel 로그 접근이 제한적이라, 인증된 호출자에게는 원인 메시지를 반환해 진단 가능하게 함.
    console.error('[크론/crawl] 크롤러 실행 오류:', err)
    const message = err instanceof Error ? err.message : String(err)
    return Response.json(
      { ok: false, error: '크롤러 실행 중 오류가 발생했습니다.', detail: message },
      { status: 500 }
    )
  }
}
