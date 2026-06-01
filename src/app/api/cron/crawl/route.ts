import type { NextRequest } from 'next/server'
import { runCrawl } from '@/lib/crawler/orchestrator'

// Node.js 런타임 사용 (Edge 런타임은 crypto 모듈 미지원)
export const runtime = 'nodejs'
// 크론 라우트는 캐시 제외
export const dynamic = 'force-dynamic'
// Vercel Pro 기준 최대 실행 시간 60초
export const maxDuration = 60

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
    const summary = await runCrawl()
    return Response.json(summary)
  } catch (err) {
    // 스택·비밀키는 콘솔에만 출력, 응답에는 일반 메시지만
    console.error('[크론/crawl] 크롤러 실행 오류:', err)
    return Response.json(
      { ok: false, error: '크롤러 실행 중 오류가 발생했습니다.' },
      { status: 500 }
    )
  }
}
