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
      action: 'content.delete',
      targetType: 'contents',
      outcome: 'failed',
      error: '요청 본문이 올바른 JSON이 아닙니다.',
    })
    return NextResponse.json({ error: '요청 본문이 올바른 JSON이 아닙니다.' }, { status: 400 })
  }
  if (ids.length === 0) {
    await completeAudit(gate.admin, gate.auditId, {
      action: 'content.delete',
      targetType: 'contents',
      outcome: 'failed',
      error: '삭제할 콘텐츠가 없습니다.',
    })
    return NextResponse.json({ error: '삭제할 콘텐츠가 없습니다.' }, { status: 400 })
  }

  const [bookmarks, archiveItems] = await Promise.all([
    gate.admin.from('bookmarks').select('id', { count: 'exact', head: true }).in('content_id', ids),
    gate.admin.from('archive_items').select('id', { count: 'exact', head: true }).in('content_id', ids),
  ])
  const { error, count } = await gate.admin.from('contents').delete({ count: 'exact' }).in('id', ids)
  await completeAudit(gate.admin, gate.auditId, {
    action: 'content.delete',
    targetType: 'contents',
    targetId: ids.length === 1 ? ids[0] : undefined,
    targetCount: count ?? 0,
    payload: { ids: ids.slice(0, 50), bookmarkCascadeCount: bookmarks.count ?? 0, archiveItemCascadeCount: archiveItems.count ?? 0 },
    outcome: error ? 'failed' : 'ok',
    error: error?.message,
  })
  if (error) return NextResponse.json({ error: '콘텐츠 삭제에 실패했습니다.' }, { status: 500 })
  return NextResponse.json({ deleted: count ?? 0 })
}
