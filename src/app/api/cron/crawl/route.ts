import type { NextRequest } from 'next/server'
import { runCrawl } from '@/lib/crawler/orchestrator'
import { createAdminClient } from '@/lib/supabase/admin'
import { runJob } from '@/lib/jobs/run-job'

// Node.js 런타임 사용 (Edge 런타임은 crypto 모듈 미지원)
export const runtime = 'nodejs'
// 크론 라우트는 캐시 제외
export const dynamic = 'force-dynamic'
// 498: 소스 수집(phase='sources') 자체는 9~35초면 끝나지만, ?days= 백필(예: days=30)이
// 여전히 이 경로를 타므로 300초 그대로 둔다.
export const maxDuration = 300

/**
 * GET /api/cron/crawl
 *
 * Vercel Cron 이 매일 KST 05:00 (UTC 20:00) 에 호출.
 * Vercel 은 CRON_SECRET 이 설정된 경우 Authorization: Bearer <CRON_SECRET> 헤더를 자동 첨부.
 * 외부 직접 호출 차단을 위해 반드시 인증 검증.
 * 498: 소스 폴링만 담당한다(phase='sources') — 키워드/회사 seed 검색은
 * /api/cron/crawl-seeds 로 분리됐다.
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

      return runCrawl({ phase: 'sources', ...options })
    })

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
