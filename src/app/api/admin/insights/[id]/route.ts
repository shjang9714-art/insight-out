import { verifyAdminRequest } from '@/lib/admin/verify-admin-request'
import { NextRequest, NextResponse } from 'next/server'
import type { InsightCardStatus } from '@/lib/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'


const VALID_STATUSES: InsightCardStatus[] = ['draft', 'published', 'archived']
const EDITABLE_TEXT_FIELDS = [
  { key: 'headline', label: '핵심 동향' },
  { key: 'card_headline', label: '에디토리얼 헤드라인' },
  { key: 'implication', label: 'LG U+ 시사점' },
] as const

/**
 * PATCH /api/admin/insights/[id]
 * body: { status?: InsightCardStatus; headline?: string; card_headline?: string; implication?: string }
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const gate = await verifyAdminRequest()
    if (!gate.ok) return gate.response

    const { id } = await params
    const body = await request.json() as Record<string, unknown>
    const changes: Record<string, string> = {}

    if (Object.hasOwn(body, 'status')) {
      const status = body.status as InsightCardStatus
      if (!VALID_STATUSES.includes(status)) {
        return NextResponse.json(
          { error: '유효하지 않은 상태값입니다.' },
          { status: 400 }
        )
      }
      changes.status = status
    }

    for (const field of EDITABLE_TEXT_FIELDS) {
      if (!Object.hasOwn(body, field.key)) continue
      const rawValue = body[field.key]
      if (typeof rawValue !== 'string') {
        return NextResponse.json({ error: `${field.label} 값은 문자열이어야 합니다.` }, { status: 400 })
      }
      const value = rawValue.trim()
      if (!value) {
        return NextResponse.json({ error: `${field.label} 값은 비울 수 없습니다.` }, { status: 400 })
      }
      changes[field.key] = value
    }

    if (Object.keys(changes).length === 0) {
      return NextResponse.json({ error: '변경할 항목이 없습니다.' }, { status: 400 })
    }

    const admin = gate.admin
    const { data, error } = await admin
      .from('insight_cards')
      .update(changes)
      .eq('id', id)
      .select('id, status, headline, card_headline, implication')
      .single()

    if (error) throw error

    return NextResponse.json(data)
  } catch (err) {
    console.error('[PATCH /api/admin/insights/[id]] 오류:', err)
    return NextResponse.json(
      { error: '인사이트 카드 변경에 실패했습니다.' },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/admin/insights/[id]
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const gate = await verifyAdminRequest()
    if (!gate.ok) return gate.response

    const { id } = await params
    const admin = gate.admin
    const { error } = await admin
      .from('insight_cards')
      .delete()
      .eq('id', id)

    if (error) throw error

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[DELETE /api/admin/insights/[id]] 오류:', err)
    return NextResponse.json(
      { error: '삭제에 실패했습니다.' },
      { status: 500 }
    )
  }
}
