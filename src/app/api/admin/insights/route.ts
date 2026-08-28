import { verifyAdminRequest } from '@/lib/admin/verify-admin-request'
import { NextRequest, NextResponse } from 'next/server'
import { generateIndustryInsightCards, generateCompanyInsightCards } from '@/lib/insight/generate'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300


/**
 * POST /api/admin/insights
 * body: { days?: number; maxThemes?: number; weekStart?: string }
 * AI 인사이트 카드 생성 트리거
 */
export async function POST(request: NextRequest) {
  try {
    const gate = await verifyAdminRequest()
    if (!gate.ok) return gate.response

    let days: number | undefined
    let maxThemes: number | undefined
    let maxCompanies: number | undefined
    let weekStart: string | undefined
    let scope: 'industry' | 'company' = 'industry'
    try {
      const body = await request.json() as Record<string, unknown>
      if (typeof body.days === 'number' && body.days > 0) days = body.days
      if (typeof body.maxThemes === 'number' && body.maxThemes > 0) maxThemes = body.maxThemes
      if (typeof body.maxCompanies === 'number' && body.maxCompanies > 0) maxCompanies = body.maxCompanies
      if (typeof body.weekStart === 'string' && body.weekStart) weekStart = body.weekStart
      if (body.scope === 'company') scope = 'company'
    } catch { /* body 없음 — 기본값 사용 */ }

    const admin = gate.admin

    if (scope === 'company') {
      const deadline = Date.now() + 270_000
      const result = await generateCompanyInsightCards(admin, { days, maxCompanies, deadline, weekStart })
      return NextResponse.json({ created: result.created, topics: result.companies })
    }

    const result = await generateIndustryInsightCards(admin, { days, maxThemes })
    return NextResponse.json(result)
  } catch (err) {
    console.error('[POST /api/admin/insights] 오류:', err)
    return NextResponse.json(
      { error: '인사이트 카드 생성에 실패했습니다.' },
      { status: 500 }
    )
  }
}

/**
 * GET /api/admin/insights
 * 최근 insight_cards 목록 반환 (admin 전체, status 포함)
 */
export async function GET() {
  try {
    const gate = await verifyAdminRequest()
    if (!gate.ok) return gate.response

    const admin = gate.admin
    const [cardsResult, companyPeriodsResult] = await Promise.all([
      admin
        .from('insight_cards')
        .select('*')
        .order('period_start', { ascending: false })
        .order('topic', { ascending: true })
        .limit(100),
      admin
        .from('insight_cards')
        .select('period_start')
        .eq('scope', 'company')
        .order('period_start', { ascending: false })
        // PostgREST max-rows. 이 이상 요청해도 서버가 조용히 자른다 — 넘길 일이 생기면 range() 페이지네이션이 필요하다
        .limit(1000),
    ])

    if (cardsResult.error) throw cardsResult.error
    if (companyPeriodsResult.error) throw companyPeriodsResult.error

    const companyWeekCounts = new Map<string, number>()
    for (const row of companyPeriodsResult.data ?? []) {
      companyWeekCounts.set(row.period_start, (companyWeekCounts.get(row.period_start) ?? 0) + 1)
    }

    return NextResponse.json({
      cards: cardsResult.data ?? [],
      companyWeeks: Array.from(companyWeekCounts, ([periodStart, count]) => ({ periodStart, count })),
    })
  } catch (err) {
    console.error('[GET /api/admin/insights] 오류:', err)
    return NextResponse.json(
      { error: '인사이트 카드 목록을 불러오지 못했습니다.' },
      { status: 500 }
    )
  }
}
