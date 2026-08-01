import { verifyAdminRequest } from '@/lib/admin/verify-admin-request'
import { NextResponse } from 'next/server'
import { OPEN_REQUEST_STATUSES } from '@/lib/admin/ops-requests'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'


/**
 * GET /api/admin/requests/count
 * 미완료(대기+진행) 요청 개수 — 사이드바 배지용 가벼운 count 쿼리.
 * 테이블 미적용(42P01) → graceful count 0.
 */
export async function GET() {
  const gate = await verifyAdminRequest()
  if (!gate.ok) return gate.response

  try {
    const admin = gate.admin
    const { count, error } = await admin
      .from('ops_requests')
      .select('id', { count: 'exact', head: true })
      .eq('post_type', 'request')
      .in('status', OPEN_REQUEST_STATUSES)

    if (error) return NextResponse.json({ count: 0 })
    return NextResponse.json({ count: count ?? 0 })
  } catch (err) {
    console.error('[/api/admin/requests/count] 오류(graceful):', err)
    return NextResponse.json({ count: 0 })
  }
}
