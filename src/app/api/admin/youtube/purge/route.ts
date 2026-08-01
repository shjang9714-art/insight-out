import { verifyAdminRequest } from '@/lib/admin/verify-admin-request'
import { NextResponse } from 'next/server'
import { completeAudit } from '@/lib/admin/audit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60


/** GET — 유튜브 영상 건수 미리보기 */
export async function GET() {
  try {
    const gate = await verifyAdminRequest({ capability: 'reset_data' })
    if (!gate.ok) return gate.response

    const admin = gate.admin
    const { count, error } = await admin
      .from('youtube_videos')
      .select('id', { count: 'exact', head: true })

    if (error) throw error
    return NextResponse.json({ count: count ?? 0 })
  } catch (err) {
    console.error('[/api/admin/youtube/purge] GET 오류:', err)
    return NextResponse.json({ error: '건수 조회 중 오류가 발생했습니다.' }, { status: 500 })
  }
}

/** POST — 유튜브 영상 전체 삭제. FK(bookmarks 등)는 cascade/set null 으로 자동 정리. */
export async function POST() {
  try {
    const gate = await verifyAdminRequest({ capability: 'reset_data' })
    if (!gate.ok) return gate.response

    const admin = gate.admin
    const { error, count } = await admin
      .from('youtube_videos')
      .delete({ count: 'exact' })
      .not('id', 'is', null)

    await completeAudit(admin, gate.auditId, { action: 'data.purge', targetType: 'youtube_videos', targetCount: count ?? 0, outcome: error ? 'failed' : 'ok', error: error?.message })
    if (error) throw error
    return NextResponse.json({ deleted: count ?? 0 })
  } catch (err) {
    console.error('[/api/admin/youtube/purge] POST 오류:', err)
    return NextResponse.json({ error: '삭제 중 오류가 발생했습니다.' }, { status: 500 })
  }
}
