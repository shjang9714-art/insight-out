import { verifyAdminRequest } from '@/lib/admin/verify-admin-request'
import { NextResponse } from 'next/server'
import { completeAudit } from '@/lib/admin/audit'
import { runJob, JobAlreadyRunningError } from '@/lib/jobs/run-job'

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
export async function POST(request: Request) {
  try {
    const gate = await verifyAdminRequest({ capability: 'reset_data' })
    if (!gate.ok) return gate.response

    const admin = gate.admin
    const body = await request.json().catch(() => ({})) as { expectedCount?: number }
    const result = await runJob(admin, { key: 'admin:purge:contents', trigger: 'admin', startedBy: gate.userId }, async () => {
    const { data: targets } = await admin.from('contents').select('id').not('original_url', 'is', null)
    const targetIds = (targets ?? []).map((row) => row.id)
    if (typeof body.expectedCount !== 'number') throw new Error('확인 건수가 필요합니다.')
    if (body.expectedCount !== targetIds.length) {
      await completeAudit(admin, gate.auditId, { action: 'data.purge', targetType: 'contents', targetCount: targetIds.length, outcome: 'failed', error: `대상 건수가 변경되었습니다(확인 시 ${body.expectedCount}건 → 현재 ${targetIds.length}건).` })
      return { mismatch: true, expected: body.expectedCount, current: targetIds.length }
    }
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
    return { deleted: count ?? 0 }
    })
    if ('mismatch' in result && result.mismatch) return NextResponse.json({ error: `대상 건수가 변경되었습니다(확인 시 ${result.expected}건 → 현재 ${result.current}건). 다시 확인해주세요.` }, { status: 409 })
    return NextResponse.json(result)
  } catch (err) {
    if (err instanceof JobAlreadyRunningError) return NextResponse.json({ error: err.message }, { status: 409 })
    console.error('[/api/admin/contents/purge] POST 오류:', err)
    return NextResponse.json({ error: '삭제 중 오류가 발생했습니다.' }, { status: 500 })
  }
}
