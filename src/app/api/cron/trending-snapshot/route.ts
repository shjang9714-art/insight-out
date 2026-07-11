import type { NextRequest } from 'next/server'
import { fetchTrendingEvents } from '@/lib/issues/trending'
import { saveTrendingSnapshot } from '@/lib/issues/trending-snapshot'
import { getKstDateString } from '@/lib/date'

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
    const date = request.nextUrl.searchParams.get('date') ?? getKstDateString()
    const events = await fetchTrendingEvents()

    if (!events) {
      return Response.json({ ok: false, error: 'trending_keywords 뷰 조회 실패' }, { status: 500 })
    }

    const saved = await saveTrendingSnapshot(events, date)
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
