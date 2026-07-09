import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { createAdminClient } from '@/lib/supabase/admin'
import { generateIndustryInsightCards, generateCompanyInsightCards } from '@/lib/insight/generate'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

async function verifyAdmin() {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return { error: NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 }) }
  }

  const { data: profile } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!profile || profile.role !== 'admin') {
    return { error: NextResponse.json({ error: '관리자 권한이 필요합니다.' }, { status: 403 }) }
  }

  return { error: null }
}

/**
 * POST /api/admin/insights
 * body: { days?: number; maxThemes?: number }
 * AI 인사이트 카드 생성 트리거
 */
export async function POST(request: NextRequest) {
  try {
    const { error: authError } = await verifyAdmin()
    if (authError) return authError

    let days: number | undefined
    let maxThemes: number | undefined
    let maxCompanies: number | undefined
    let scope: 'industry' | 'company' = 'industry'
    try {
      const body = await request.json() as Record<string, unknown>
      if (typeof body.days === 'number' && body.days > 0) days = body.days
      if (typeof body.maxThemes === 'number' && body.maxThemes > 0) maxThemes = body.maxThemes
      if (typeof body.maxCompanies === 'number' && body.maxCompanies > 0) maxCompanies = body.maxCompanies
      if (body.scope === 'company') scope = 'company'
    } catch { /* body 없음 — 기본값 사용 */ }

    const admin = createAdminClient()

    if (scope === 'company') {
      const deadline = Date.now() + 270_000
      const result = await generateCompanyInsightCards(admin, { days, maxCompanies, deadline })
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
    const { error: authError } = await verifyAdmin()
    if (authError) return authError

    const admin = createAdminClient()
    const { data, error } = await admin
      .from('insight_cards')
      .select('*')
      .order('period_start', { ascending: false })
      .order('topic', { ascending: true })
      .limit(100)

    if (error) throw error

    return NextResponse.json({ cards: data ?? [] })
  } catch (err) {
    console.error('[GET /api/admin/insights] 오류:', err)
    return NextResponse.json(
      { error: '인사이트 카드 목록을 불러오지 못했습니다.' },
      { status: 500 }
    )
  }
}
