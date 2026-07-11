import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

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
 * GET /api/admin/daily-insights?day_of=YYYY-MM-DD
 * 날짜 목록 + 선택 날짜(기본 최신)의 카드 전체를 반환.
 */
export async function GET(request: NextRequest) {
  try {
    const { error: authError } = await verifyAdmin()
    if (authError) return authError

    const admin = createAdminClient()
    const requestedDay = request.nextUrl.searchParams.get('day_of')

    const { data: dayRows, error: dayError } = await admin
      .from('daily_insights')
      .select('day_of')
      .order('day_of', { ascending: false })
    if (dayError) throw dayError

    const days = [...new Set((dayRows ?? []).map((r) => r.day_of as string))]
    const dayOf = requestedDay && days.includes(requestedDay) ? requestedDay : (days[0] ?? null)

    if (!dayOf) {
      return NextResponse.json({ days: [], dayOf: null, summary: null, cards: [] })
    }

    const { data: cards, error: cardsError } = await admin
      .from('daily_insights')
      .select('*')
      .eq('day_of', dayOf)
      .order('display_order', { ascending: true })
    if (cardsError) throw cardsError

    const rows = cards ?? []
    const summary = {
      total: rows.length,
      needsReview: rows.filter((c) => c.needs_review).length,
      published: rows.filter((c) => c.status === 'published').length,
      rejected: rows.filter((c) => c.status === 'rejected').length,
    }

    return NextResponse.json({ days, dayOf, summary, cards: rows })
  } catch (err) {
    console.error('[GET /api/admin/daily-insights] 오류:', err)
    return NextResponse.json({ error: '목록 조회에 실패했습니다.' }, { status: 500 })
  }
}
