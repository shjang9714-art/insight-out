import { verifyAdminRequest } from '@/lib/admin/verify-admin-request'
import { NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60


/** GET — 크롤링 기사 건수 미리보기 */
export async function GET() {
  try {
    const gate = await verifyAdminRequest({ capability: 'reset_data' })
    if (!gate.ok) return gate.response

    const admin = gate.admin
    const { count, error } = await admin
      .from('contents')
      .select('id', { count: 'exact', head: true })
      .not('original_url', 'is', null)

    if (error) throw error
    return NextResponse.json({ count: count ?? 0 })
  } catch (err) {
    console.error('[/api/admin/contents/purge] GET 오류:', err)
    return NextResponse.json({ error: '건수 조회 중 오류가 발생했습니다.' }, { status: 500 })
  }
}

/** POST — 크롤링 기사 전체 삭제 (original_url IS NOT NULL). FK cascade로 연관행 자동 정리. */
export async function POST() {
  try {
    const gate = await verifyAdminRequest({ capability: 'reset_data' })
    if (!gate.ok) return gate.response

    const admin = gate.admin
    const { error, count } = await admin
      .from('contents')
      .delete({ count: 'exact' })
      .not('original_url', 'is', null)

    if (error) throw error
    return NextResponse.json({ deleted: count ?? 0 })
  } catch (err) {
    console.error('[/api/admin/contents/purge] POST 오류:', err)
    return NextResponse.json({ error: '삭제 중 오류가 발생했습니다.' }, { status: 500 })
  }
}
