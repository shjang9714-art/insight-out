import { NextResponse, type NextRequest } from 'next/server'
import { completeAudit } from '@/lib/admin/audit'
import { verifyAdminRequest } from '@/lib/admin/verify-admin-request'

export async function POST(request: NextRequest) {
  const gate = await verifyAdminRequest()
  if (!gate.ok) return gate.response

  let ids: string[] = []
  try {
    const body = await request.json() as { ids?: unknown }
    ids = Array.isArray(body.ids)
      ? [...new Set(body.ids.filter((id): id is string => typeof id === 'string' && id.length > 0))]
      : []
  } catch {
    await completeAudit(gate.admin, gate.auditId, {
      action: 'content.soft_delete',
      targetType: 'contents',
      outcome: 'failed',
      error: '요청 본문이 올바른 JSON이 아닙니다.',
    })
    return NextResponse.json({ error: '요청 본문이 올바른 JSON이 아닙니다.' }, { status: 400 })
  }
  if (ids.length === 0) {
    await completeAudit(gate.admin, gate.auditId, {
      action: 'content.soft_delete',
      targetType: 'contents',
      outcome: 'failed',
      error: '삭제할 콘텐츠가 없습니다.',
    })
    return NextResponse.json({ error: '삭제할 콘텐츠가 없습니다.' }, { status: 400 })
  }

  const bookmarks = await gate.admin.from('bookmarks').select('id', { count: 'exact', head: true }).in('content_id', ids)
  // 492 — 하드 delete 대신 소프트 삭제. CASCADE 가 발화하지 않으므로 북마크는 보존된다.
  const { error, count } = await gate.admin
    .from('contents')
    .update({ deleted_at: new Date().toISOString(), deleted_by: gate.userId }, { count: 'exact' })
    .in('id', ids)
    .is('deleted_at', null)
  await completeAudit(gate.admin, gate.auditId, {
    action: 'content.soft_delete',
    targetType: 'contents',
    targetId: ids.length === 1 ? ids[0] : undefined,
    targetCount: count ?? 0,
    payload: {
      ids: ids.slice(0, 50),
      bookmarkPreservedCount: bookmarks.error ? null : bookmarks.count ?? 0,
    },
    outcome: error ? 'failed' : 'ok',
    error: error?.message,
  })
  if (error) return NextResponse.json({ error: '콘텐츠 삭제에 실패했습니다.' }, { status: 500 })
  return NextResponse.json({ deleted: count ?? 0 })
}
