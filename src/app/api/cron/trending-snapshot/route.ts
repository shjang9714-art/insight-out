import type { NextRequest } from 'next/server'
import { fetchTrendingEvents } from '@/lib/issues/trending'
import { saveTrendingSnapshot } from '@/lib/issues/trending-snapshot'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return Response.json({ ok: false, error: '인증 실패' }, { status: 401 })
  }

  try {
    const explicitDate = request.nextUrl.searchParams.get('date')
    const trending = await fetchTrendingEvents()

    if (!trending) {
      return Response.json({ ok: false, error: 'trending_keywords 뷰 조회 실패' }, { status: 500 })
    }

    // 명시적 date 쿼리(백필용)가 없으면 랭킹에 반영된 기사들의 실제 최신일(asOfDateKst)로
    // 저장 — 시스템 시계상 "오늘"을 그대로 쓰면 히스토리 조회 시에도 날짜·건수 불일치가 재현된다.
    const date = explicitDate ?? trending.asOfDateKst
    const saved = await saveTrendingSnapshot(trending.events, date)
    return Response.json({ ok: true, date, saved })
  } catch (err) {
    console.error('[크론/trending-snapshot] 스냅샷 적재 오류:', err)
    const message = err instanceof Error ? err.message : String(err)
    return Response.json(
      { ok: false, error: '스냅샷 적재 중 오류가 발생했습니다.', detail: message },
      { status: 500 }
    )
  }
}
