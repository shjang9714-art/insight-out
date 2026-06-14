import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type BriefingStatus = 'draft' | 'published' | 'archived'

// 허용된 상태 전이 [현재 → 다음]
const ALLOWED_TRANSITIONS: Partial<Record<BriefingStatus, BriefingStatus[]>> = {
  draft: ['published'],
  published: ['archived', 'draft'],
  archived: ['published'],
}

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
    return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })
  }

  const { data: profile } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!profile || profile.role !== 'admin') {
    return NextResponse.json({ error: '관리자 권한이 필요합니다.' }, { status: 403 })
  }

  return null
}

/**
 * PATCH /api/admin/briefings/[id]
 * 어드민 전용 — 브리핑 상태 전이 (draft↔published↔archived).
 */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authError = await verifyAdmin()
    if (authError) return authError

    const { id } = await params
    if (!id) {
      return NextResponse.json({ error: '브리핑 ID가 필요합니다.' }, { status: 400 })
    }

    const body = (await req.json()) as { status?: string }
    const nextStatus = body.status as BriefingStatus | undefined

    if (!nextStatus || !['draft', 'published', 'archived'].includes(nextStatus)) {
      return NextResponse.json(
        { error: 'status 값이 올바르지 않습니다. (draft | published | archived)' },
        { status: 400 }
      )
    }

    const admin = createAdminClient()

    const { data: briefing, error: fetchError } = await admin
      .from('briefings')
      .select('id, status, published_at')
      .eq('id', id)
      .maybeSingle()

    if (fetchError) throw fetchError
    if (!briefing) {
      return NextResponse.json({ error: '브리핑을 찾을 수 없습니다.' }, { status: 404 })
    }

    const currentStatus = briefing.status as BriefingStatus
    const allowed = ALLOWED_TRANSITIONS[currentStatus] ?? []

    if (!allowed.includes(nextStatus)) {
      return NextResponse.json(
        { error: '허용되지 않는 상태 전이입니다.' },
        { status: 400 }
      )
    }

    const updatePayload: Record<string, unknown> = { status: nextStatus }
    if (nextStatus === 'published' && !briefing.published_at) {
      updatePayload.published_at = new Date().toISOString()
    }

    const { error: updateError } = await admin
      .from('briefings')
      .update(updatePayload)
      .eq('id', id)

    if (updateError) throw updateError

    return NextResponse.json({ ok: true, status: nextStatus })
  } catch (err) {
    console.error('[PATCH /api/admin/briefings/[id]] 오류:', err)
    return NextResponse.json(
      { error: '상태 변경 중 오류가 발생했습니다.' },
      { status: 500 }
    )
  }
}
