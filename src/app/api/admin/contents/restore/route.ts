import { NextResponse, type NextRequest } from 'next/server'
import { completeAudit } from '@/lib/admin/audit'
import { verifyAdminRequest } from '@/lib/admin/verify-admin-request'

/** POST /api/admin/contents/restore — 휴지통(소프트 삭제)에서 복원. */
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
      action: 'content.restore',
      targetType: 'contents',
      outcome: 'failed',
      error: '요청 본문이 올바른 JSON이 아닙니다.',
    })
    return NextResponse.json({ error: '요청 본문이 올바른 JSON이 아닙니다.' }, { status: 400 })
  }
  if (ids.length === 0) {
    await completeAudit(gate.admin, gate.auditId, {
      action: 'content.restore',
      targetType: 'contents',
      outcome: 'failed',
      error: '복원할 콘텐츠가 없습니다.',
    })
    return NextResponse.json({ error: '복원할 콘텐츠가 없습니다.' }, { status: 400 })
  }

  const { error, count } = await gate.admin
    .from('contents')
    .update({ deleted_at: null, deleted_by: null }, { count: 'exact' })
    .in('id', ids)
    .not('deleted_at', 'is', null)

  await completeAudit(gate.admin, gate.auditId, {
    action: 'content.restore',
    targetType: 'contents',
    targetId: ids.length === 1 ? ids[0] : undefined,
    targetCount: count ?? 0,
    payload: { ids: ids.slice(0, 50) },
    outcome: error ? 'failed' : 'ok',
    error: error?.message,
  })
  if (error) return NextResponse.json({ error: '복원에 실패했습니다.' }, { status: 500 })
  return NextResponse.json({ restored: count ?? 0 })
}
