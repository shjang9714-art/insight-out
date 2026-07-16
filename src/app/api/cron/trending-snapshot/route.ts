import type { NextRequest } from 'next/server'
import { computeTrendingEvents } from '@/lib/issues/trending'
import { saveTrendingSnapshot } from '@/lib/issues/trending-snapshot'
import { createAdminClient } from '@/lib/supabase/admin'
import { runJob } from '@/lib/jobs/run-job'

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
    const admin = createAdminClient()
    const result = await runJob(admin, { key: 'cron:trending-snapshot', trigger: 'cron' }, async () => {
      // fetchTrendingEvents()(unstable_cache)가 아니라 computeTrendingEvents()를 직접 호출 —
      // 캐시가 stale-while-revalidate라 트래픽이 뜸한 날엔 크롤 이전 값을 그대로 받을 수 있다
      // (2026-07-15 실측 사고: 05:00 KST 크롤 후 아무도 접속 안 해 23:50 KST 스냅샷이 전날
      // 기준일을 저장). 하루 1회뿐인 스냅샷이니 캐시 없이 그 시점 실측값을 직접 계산한다.
      const trending = await computeTrendingEvents()

      if (!trending) {
        return { ok: false as const, error: 'trending_keywords 뷰 조회 실패' }
      }

      // 명시적 date 쿼리(백필용)가 없으면 랭킹에 반영된 기사들의 실제 최신일(asOfDateKst)로
      // 저장 — 시스템 시계상 "오늘"을 그대로 쓰면 히스토리 조회 시에도 날짜·건수 불일치가 재현된다.
      const date = explicitDate ?? trending.asOfDateKst
      const saved = await saveTrendingSnapshot(trending.events, date)
      return { ok: true as const, date, saved }
    })

    if (!result.ok) {
      return Response.json(result, { status: 500 })
    }
    return Response.json(result)
  } catch (err) {
    console.error('[크론/trending-snapshot] 스냅샷 적재 오류:', err)
    const message = err instanceof Error ? err.message : String(err)
    return Response.json(
      { ok: false, error: '스냅샷 적재 중 오류가 발생했습니다.', detail: message },
      { status: 500 }
    )
  }
}
