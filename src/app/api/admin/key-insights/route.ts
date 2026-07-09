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
 * GET /api/admin/key-insights?week_of=YYYY-MM-DD
 * 주차 목록 + 선택 주차(기본 최신)의 카드 전체를 반환.
 */
export async function GET(request: NextRequest) {
  try {
    const { error: authError } = await verifyAdmin()
    if (authError) return authError

    const admin = createAdminClient()
    const requestedWeek = request.nextUrl.searchParams.get('week_of')

    const { data: weekRows, error: weekError } = await admin
      .from('key_insights')
      .select('week_of')
      .order('week_of', { ascending: false })
    if (weekError) throw weekError

    const weeks = [...new Set((weekRows ?? []).map((r) => r.week_of as string))]
    const weekOf = requestedWeek && weeks.includes(requestedWeek) ? requestedWeek : (weeks[0] ?? null)

    if (!weekOf) {
      return NextResponse.json({ weeks: [], weekOf: null, summary: null, cards: [] })
    }

    const { data: cards, error: cardsError } = await admin
      .from('key_insights')
      .select('*')
      .eq('week_of', weekOf)
      .order('display_order', { ascending: true, nullsFirst: false })
    if (cardsError) throw cardsError

    const rows = cards ?? []
    const summary = {
      total: rows.length,
      needsReview: rows.filter((c) => c.status === 'needs_review' || c.status === 'draft').length,
      published: rows.filter((c) => c.status === 'published').length,
      featured: rows.filter((c) => c.is_featured).length,
    }

    return NextResponse.json({ weeks, weekOf, summary, cards: rows })
  } catch (err) {
    console.error('[GET /api/admin/key-insights] 오류:', err)
    return NextResponse.json({ error: '목록 조회에 실패했습니다.' }, { status: 500 })
  }
}
