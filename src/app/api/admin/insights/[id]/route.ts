import { verifyAdminRequest } from '@/lib/admin/verify-admin-request'
import { NextRequest, NextResponse } from 'next/server'
import type { InsightCardStatus } from '@/lib/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'


const VALID_STATUSES: InsightCardStatus[] = ['draft', 'published', 'archived']

/**
 * PATCH /api/admin/insights/[id]
 * body: { status: InsightCardStatus }
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
    const status = body.status as InsightCardStatus

    if (!VALID_STATUSES.includes(status)) {
      return NextResponse.json(
        { error: '유효하지 않은 상태값입니다.' },
        { status: 400 }
      )
    }

    const admin = gate.admin
    const { data, error } = await admin
      .from('insight_cards')
      .update({ status })
      .eq('id', id)
      .select('id, status')
      .single()

    if (error) throw error

    return NextResponse.json(data)
  } catch (err) {
    console.error('[PATCH /api/admin/insights/[id]] 오류:', err)
    return NextResponse.json(
      { error: '상태 변경에 실패했습니다.' },
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
