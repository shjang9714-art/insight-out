import { verifyAdminRequest } from '@/lib/admin/verify-admin-request'
import { NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'


/**
 * GET /api/admin/daily-insights/count
 * needs_review=true 카운트 — 사이드바 배지용 가벼운 count 쿼리.
 */
export async function GET() {
  const gate = await verifyAdminRequest()
  if (!gate.ok) return gate.response

  try {
    const admin = gate.admin
    const { count, error } = await admin
      .from('daily_insights')
      .select('id', { count: 'exact', head: true })
      .eq('needs_review', true)

    if (error) return NextResponse.json({ count: 0 })
    return NextResponse.json({ count: count ?? 0 })
  } catch (err) {
    console.error('[/api/admin/daily-insights/count] 오류(graceful):', err)
    return NextResponse.json({ count: 0 })
  }
}
