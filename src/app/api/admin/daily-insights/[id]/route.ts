import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { createAdminClient } from '@/lib/supabase/admin'
import { DAILY_INSIGHT_CATEGORIES } from '@/lib/daily-insights/constants'

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

const VALID_STATUSES = ['published', 'rejected'] as const
type DailyInsightStatus = typeof VALID_STATUSES[number]

interface PatchBody {
  status?: DailyInsightStatus
  needs_review?: boolean
  headline?: string
  summary_ko?: string
  category?: string | null
  market_trend?: string | null
  competitor_trend?: string | null
  implication?: string | null
  display_order?: number
}

/**
 * PATCH /api/admin/daily-insights/[id]
 * 필드 인라인 수정 · needs_review 토글 · status(published/rejected) 전환 · 순서 조정.
 * 하드 삭제는 지원하지 않는다(반려로 대체).
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { error: authError } = await verifyAdmin()
    if (authError) return authError

    const { id } = await params
    const body = (await request.json()) as PatchBody

    const patch: Record<string, unknown> = {}

    if (body.headline !== undefined) {
      if (!body.headline.trim()) {
        return NextResponse.json({ error: '헤드라인은 비울 수 없습니다.' }, { status: 400 })
      }
      patch.headline = body.headline.trim()
    }
    if (body.summary_ko !== undefined) {
      if (!body.summary_ko.trim()) {
        return NextResponse.json({ error: '요약은 비울 수 없습니다.' }, { status: 400 })
      }
      patch.summary_ko = body.summary_ko.trim()
    }
    if (body.category !== undefined) {
      if (body.category !== null && !(DAILY_INSIGHT_CATEGORIES as readonly string[]).includes(body.category)) {
        return NextResponse.json({ error: '유효하지 않은 카테고리입니다.' }, { status: 400 })
      }
      patch.category = body.category
    }
    if (body.market_trend !== undefined) patch.market_trend = body.market_trend?.trim() || null
    if (body.competitor_trend !== undefined) patch.competitor_trend = body.competitor_trend?.trim() || null
    if (body.implication !== undefined) patch.implication = body.implication?.trim() || null
    if (body.needs_review !== undefined) patch.needs_review = body.needs_review
    if (body.display_order !== undefined) patch.display_order = body.display_order

    if (body.status !== undefined) {
      if (!VALID_STATUSES.includes(body.status)) {
        return NextResponse.json({ error: '유효하지 않은 상태값입니다.' }, { status: 400 })
      }
      patch.status = body.status
    }

    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: '변경할 필드가 없습니다.' }, { status: 400 })
    }

    const admin = createAdminClient()
    const { data, error } = await admin
      .from('daily_insights')
      .update(patch)
      .eq('id', id)
      .select('*')
      .single()

    if (error) throw error

    return NextResponse.json({ ok: true, card: data })
  } catch (err) {
    console.error('[PATCH /api/admin/daily-insights/[id]] 오류:', err)
    return NextResponse.json({ error: '수정에 실패했습니다.' }, { status: 500 })
  }
}
