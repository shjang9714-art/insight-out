import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import type { KeyInsightRow } from '@/lib/key-insights/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * GET /api/key-insights?week_of=YYYY-MM-DD
 * "핵심 Insight" 공개 탭(§2-2) 전용 — 게시된(published) 주차·카드만 반환.
 * RLS 가 admin 에게는 전체 status 조회를 허용하지만, 이 라우트는 공개 탭이므로
 * 조회자 role 과 무관하게 항상 published 만 내려준다(쿼리에 명시적으로 고정).
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })
    }

    const requestedWeek = request.nextUrl.searchParams.get('week_of')

    const { data: weekRows, error: weekError } = await supabase
      .from('key_insights')
      .select('week_of')
      .eq('status', 'published')
      .order('week_of', { ascending: false })
    if (weekError) throw weekError

    const weeks = [...new Set((weekRows ?? []).map((r) => r.week_of as string))]
    const weekOf = requestedWeek && weeks.includes(requestedWeek) ? requestedWeek : (weeks[0] ?? null)

    if (!weekOf) {
      return NextResponse.json({ weeks: [], weekOf: null, cards: [] })
    }

    const { data: cards, error: cardsError } = await supabase
      .from('key_insights')
      .select('*')
      .eq('week_of', weekOf)
      .eq('status', 'published')
      .order('display_order', { ascending: true, nullsFirst: false })
    if (cardsError) throw cardsError

    return NextResponse.json({ weeks, weekOf, cards: (cards ?? []) as KeyInsightRow[] })
  } catch (err) {
    console.error('[GET /api/key-insights] 오류:', err)
    return NextResponse.json({ error: '핵심 Insight 조회에 실패했습니다.' }, { status: 500 })
  }
}
