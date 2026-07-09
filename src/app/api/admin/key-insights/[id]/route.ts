import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { createAdminClient } from '@/lib/supabase/admin'
import { KEY_INSIGHT_CATEGORIES } from '@/lib/key-insights/constants'

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

const VALID_STATUSES = ['draft', 'needs_review', 'published', 'rejected'] as const
type KeyInsightStatus = typeof VALID_STATUSES[number]

interface PatchBody {
  status?: KeyInsightStatus
  headline?: string
  summary_ko?: string
  implication?: string | null
  category?: string
  source_name?: string | null
  published_at?: string | null
  source_url?: string | null
  is_new?: boolean
  is_featured?: boolean
  needs_verify?: boolean
  display_order?: number | null
}

/**
 * PATCH /api/admin/key-insights/[id]
 * 필드 인라인 수정 · NEW/featured 토글 · 게시/반려 · 순서 조정을 전부 처리.
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
        return NextResponse.json({ error: '핵심요약은 비울 수 없습니다.' }, { status: 400 })
      }
      patch.summary_ko = body.summary_ko.trim()
    }
    if (body.implication !== undefined) patch.implication = body.implication?.trim() || null
    if (body.category !== undefined) {
      if (!(KEY_INSIGHT_CATEGORIES as readonly string[]).includes(body.category)) {
        return NextResponse.json({ error: '유효하지 않은 카테고리입니다.' }, { status: 400 })
      }
      patch.category = body.category
    }
    if (body.source_name !== undefined) patch.source_name = body.source_name?.trim() || null
    if (body.published_at !== undefined) patch.published_at = body.published_at || null
    if (body.source_url !== undefined) patch.source_url = body.source_url?.trim() || null
    if (body.is_new !== undefined) patch.is_new = body.is_new
    if (body.is_featured !== undefined) patch.is_featured = body.is_featured
    if (body.needs_verify !== undefined) patch.needs_verify = body.needs_verify
    if (body.display_order !== undefined) patch.display_order = body.display_order

    const admin = createAdminClient()

    if (body.status !== undefined) {
      if (!VALID_STATUSES.includes(body.status)) {
        return NextResponse.json({ error: '유효하지 않은 상태값입니다.' }, { status: 400 })
      }

      if (body.status === 'published') {
        // 게시 게이트(§2-3) — 링크 미검증(needs_verify=true) 카드는 게시 불가.
        // 이번 요청에 needs_verify 값이 같이 왔으면 그 값을, 아니면 DB 현재값을 기준으로 판단.
        const effectiveNeedsVerify =
          body.needs_verify !== undefined
            ? body.needs_verify
            : (await admin.from('key_insights').select('needs_verify').eq('id', id).single()).data
                ?.needs_verify

        if (effectiveNeedsVerify) {
          return NextResponse.json(
            { error: '원문 링크 검증이 필요합니다. 링크를 확인한 뒤 "검증 완료"로 표시하고 다시 게시해주세요.' },
            { status: 400 }
          )
        }
      }

      patch.status = body.status
    }

    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: '변경할 필드가 없습니다.' }, { status: 400 })
    }

    const { data, error } = await admin
      .from('key_insights')
      .update(patch)
      .eq('id', id)
      .select('*')
      .single()

    if (error) throw error

    return NextResponse.json({ ok: true, card: data })
  } catch (err) {
    console.error('[PATCH /api/admin/key-insights/[id]] 오류:', err)
    return NextResponse.json({ error: '수정에 실패했습니다.' }, { status: 500 })
  }
}
