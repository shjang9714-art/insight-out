import { verifyAdminRequest } from '@/lib/admin/verify-admin-request'
import { NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type BriefingStatus = 'draft' | 'published' | 'archived'

// 허용된 상태 전이 [현재 → 다음]
const ALLOWED_TRANSITIONS: Partial<Record<BriefingStatus, BriefingStatus[]>> = {
  draft: ['published'],
  published: ['archived', 'draft'],
  archived: ['published'],
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
    const gate = await verifyAdminRequest()
    if (!gate.ok) return gate.response

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

    const admin = gate.admin

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
