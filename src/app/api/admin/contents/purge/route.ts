import { verifyAdminRequest } from '@/lib/admin/verify-admin-request'
import { NextResponse, type NextRequest } from 'next/server'
import { completeAudit } from '@/lib/admin/audit'
import { runJob, JobAlreadyRunningError } from '@/lib/jobs/run-job'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60


// 492 · 3단계 — "크롤링 기사 전체 삭제"에서 "휴지통 비우기"로 재정의.
// 대상은 항상 deleted_at is not null(소프트 삭제된 행)로 한정한다. 살아있는 콘텐츠를
// 전량 삭제하는 경로를 남기지 않는다 — 전량 삭제가 필요하면 목록에서 선택 → 소프트 삭제
// → 휴지통 비우기 순서를 거친다.
// ids 를 지정하면 그중 소프트 삭제된 것만(휴지통 화면의 선택 영구삭제), 지정하지 않으면
// 휴지통 전체(AdminDataReset의 "휴지통 비우기" 버튼)를 대상으로 한다.

/**
 * GET — 휴지통(소프트 삭제된 콘텐츠) 건수 미리보기.
 * `?ids=a,b,c` 가 오면 그 대상의 연쇄 건수(북마크·아카이브)도 함께 돌려준다(492-E).
 * 브라우저 RLS 클라이언트로는 bookmarks/archive_items 가 본인 것만 잡혀 0으로 위장되므로,
 * 여기서 service_role 로 정확히 세서 확인 다이얼로그에 내려준다.
 */
export async function GET(request: NextRequest) {
  try {
    const gate = await verifyAdminRequest({ capability: 'reset_data' })
    if (!gate.ok) return gate.response

    const admin = gate.admin
    const idsParam = request.nextUrl.searchParams.get('ids')
    const ids = idsParam
      ? [...new Set(idsParam.split(',').map((id) => id.trim()).filter((id) => id.length > 0))]
      : null

    let contentsQuery = admin.from('contents').select('id', { count: 'exact', head: true }).not('deleted_at', 'is', null)
    if (ids) contentsQuery = contentsQuery.in('id', ids)
    const { count, error } = await contentsQuery
    if (error) throw error

    if (!ids) return NextResponse.json({ count: count ?? 0 })

    const [bookmarks, archiveItems] = await Promise.all([
      admin.from('bookmarks').select('id', { count: 'exact', head: true }).in('content_id', ids),
      // archive_items 는 id 컬럼이 없다 — content_id 로 count
      admin.from('archive_items').select('content_id', { count: 'exact', head: true }).in('content_id', ids),
    ])

    return NextResponse.json({
      count: count ?? 0,
      bookmarks: bookmarks.error ? null : bookmarks.count ?? 0,
      archiveItems: archiveItems.error ? null : archiveItems.count ?? 0,
    })
  } catch (err) {
    console.error('[/api/admin/contents/purge] GET 오류:', err)
    return NextResponse.json({ error: '건수 조회 중 오류가 발생했습니다.' }, { status: 500 })
  }
}

/** POST — 휴지통(소프트 삭제된 콘텐츠) 영구 삭제. 여기서만 CASCADE가 발화한다. */
export async function POST(request: Request) {
  let auditAdmin: Parameters<typeof completeAudit>[0] | undefined
  let auditId: Parameters<typeof completeAudit>[1] | undefined
  try {
    const gate = await verifyAdminRequest({ capability: 'reset_data' })
    if (!gate.ok) return gate.response
    auditAdmin = gate.admin
    auditId = gate.auditId

    const admin = gate.admin
    const body = await request.json().catch(() => ({})) as { expectedCount?: number; ids?: unknown }
    const selectedIds = Array.isArray(body.ids)
      ? [...new Set(body.ids.filter((id): id is string => typeof id === 'string' && id.length > 0))]
      : null
    const result = await runJob(admin, { key: 'admin:purge:contents', trigger: 'admin', startedBy: gate.userId }, async () => {
    let targetsQuery = admin.from('contents').select('id').not('deleted_at', 'is', null)
    if (selectedIds) targetsQuery = targetsQuery.in('id', selectedIds)
    const { data: targets } = await targetsQuery
    const targetIds = (targets ?? []).map((row) => row.id)
    if (typeof body.expectedCount !== 'number') throw new Error('확인 건수가 필요합니다.')
    if (body.expectedCount !== targetIds.length) {
      await completeAudit(admin, gate.auditId, { action: 'content.purge', targetType: 'contents', targetCount: targetIds.length, outcome: 'failed', error: `대상 건수가 변경되었습니다(확인 시 ${body.expectedCount}건 → 현재 ${targetIds.length}건).` })
      return { mismatch: true, expected: body.expectedCount, current: targetIds.length }
    }
    const [bookmarks, archiveItems] = targetIds.length > 0
      ? await Promise.all([
          admin.from('bookmarks').select('id', { count: 'exact', head: true }).in('content_id', targetIds),
          // archive_items 는 id 컬럼이 없다 — content_id 로 count
          admin.from('archive_items').select('content_id', { count: 'exact', head: true }).in('content_id', targetIds),
        ])
      : [{ count: 0, error: null }, { count: 0, error: null }]
    const { error, count } = await admin
      .from('contents')
      .delete({ count: 'exact' })
      .in('id', targetIds)

    await completeAudit(admin, gate.auditId, {
      action: 'content.purge',
      targetType: 'contents',
      targetCount: count ?? 0,
      payload: {
        selectionMode: selectedIds ? 'selected' : 'all_trash',
        ids: targetIds.slice(0, 50),
        bookmarkCascadeCount: bookmarks.error ? null : bookmarks.count ?? 0,
        archiveItemCascadeCount: archiveItems.error ? null : archiveItems.count ?? 0,
      },
      outcome: error ? 'failed' : 'ok',
      error: error?.message,
    })
    if (error) throw error
    return { deleted: count ?? 0 }
    }, { rejectIfRunning: true })
    if ('mismatch' in result && result.mismatch) return NextResponse.json({ error: `대상 건수가 변경되었습니다(확인 시 ${result.expected}건 → 현재 ${result.current}건). 다시 확인해주세요.` }, { status: 409 })
    return NextResponse.json(result)
  } catch (err) {
    if (err instanceof JobAlreadyRunningError) {
      if (auditAdmin && auditId) await completeAudit(auditAdmin, auditId, { action: 'content.purge', targetType: 'contents', targetCount: 0, outcome: 'failed', error: err.message })
      return NextResponse.json({ error: err.message }, { status: 409 })
    }
    console.error('[/api/admin/contents/purge] POST 오류:', err)
    return NextResponse.json({ error: '삭제 중 오류가 발생했습니다.' }, { status: 500 })
  }
}
