import { verifyAdminRequest } from '@/lib/admin/verify-admin-request'
import { NextResponse } from 'next/server'
import { completeAudit } from '@/lib/admin/audit'

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
    const { data: targets } = await admin.from('contents').select('id').not('original_url', 'is', null)
    const targetIds = (targets ?? []).map((row) => row.id)
    const [bookmarks, archiveItems] = targetIds.length > 0
      ? await Promise.all([
          admin.from('bookmarks').select('id', { count: 'exact', head: true }).in('content_id', targetIds),
          admin.from('archive_items').select('id', { count: 'exact', head: true }).in('content_id', targetIds),
        ])
      : [{ count: 0 }, { count: 0 }]
    const { error, count } = await admin
      .from('contents')
      .delete({ count: 'exact' })
      .not('original_url', 'is', null)

    await completeAudit(admin, gate.auditId, {
      action: 'data.purge',
      targetType: 'contents',
      targetCount: count ?? 0,
      payload: { ids: targetIds.slice(0, 50), bookmarkCascadeCount: bookmarks.count ?? 0, archiveItemCascadeCount: archiveItems.count ?? 0 },
      outcome: error ? 'failed' : 'ok',
      error: error?.message,
    })
    if (error) throw error
    return NextResponse.json({ deleted: count ?? 0 })
  } catch (err) {
    console.error('[/api/admin/contents/purge] POST 오류:', err)
    return NextResponse.json({ error: '삭제 중 오류가 발생했습니다.' }, { status: 500 })
  }
}
