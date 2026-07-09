import type { NextRequest } from 'next/server'
import { generateKeyInsightBatch } from '@/lib/key-insights/generate'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

/**
 * 매주 목요일 밤 "주목하세요, 핵심 Insight" 배치 생성.
 * ⚠️ 요일 게이트(§3-3)는 아직 미적용 — 지금은 어드민 수동 트리거/force 검증용.
 * 목요일 게이트·Hobby 폴백은 뒤이어 §3-3에서 newsletter cron 패턴(dispatch.ts)을 재사용해 추가한다.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return Response.json({ ok: false, error: '인증 실패' }, { status: 401 })
  }

  try {
    const force = request.nextUrl.searchParams.get('force') === '1'
    const result = await generateKeyInsightBatch({ force })
    return Response.json(result)
  } catch (err) {
    console.error('[크론/key-insights] 생성 오류:', err)
    const message = err instanceof Error ? err.message : String(err)
    return Response.json(
      { ok: false, error: '핵심 Insight 생성 중 오류가 발생했습니다.', detail: message },
      { status: 500 }
    )
  }
}
