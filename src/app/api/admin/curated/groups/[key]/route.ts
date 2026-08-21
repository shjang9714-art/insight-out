import { NextRequest, NextResponse } from 'next/server'
import { verifyAdminRequest } from '@/lib/admin/verify-admin-request'
import {
  groupDisplayMode,
  groupKind,
  inputErrorResponse,
  optionalBoolean,
  optionalInteger,
  requiredText,
} from '@/lib/admin/curated-admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  const gate = await verifyAdminRequest({ capability: 'manage_sources' })
  if (!gate.ok) return gate.response
  try {
    const { key } = await params
    const body = await request.json() as Record<string, unknown>
    if (Object.hasOwn(body, 'key')) return NextResponse.json({ error: '그룹 key는 수정할 수 없습니다.' }, { status: 400 })
    const changes: Record<string, unknown> = {}
    if (Object.hasOwn(body, 'label')) changes.label = requiredText(body.label, '그룹명')
    if (Object.hasOwn(body, 'kind')) changes.kind = groupKind(body.kind)
    if (Object.hasOwn(body, 'display_mode')) changes.display_mode = groupDisplayMode(body.display_mode)
    if (Object.hasOwn(body, 'sort_order')) changes.sort_order = optionalInteger(body.sort_order, '정렬 순서')
    if (Object.hasOwn(body, 'is_active')) changes.is_active = optionalBoolean(body.is_active, '활성 여부')
    if (Object.keys(changes).length === 0) return NextResponse.json({ error: '변경할 항목이 없습니다.' }, { status: 400 })
    const { data, error } = await gate.admin
      .from('curated_groups')
      .update(changes)
      .eq('key', key)
      .select('*')
      .single()
    if (error) throw error
    return NextResponse.json({ group: data })
  } catch (error) {
    const inputError = inputErrorResponse(error)
    if (inputError) return NextResponse.json(inputError, { status: 400 })
    console.error('[PATCH /api/admin/curated/groups/[key]] 오류:', error)
    return NextResponse.json({ error: '기업 그룹을 수정하지 못했습니다.' }, { status: 500 })
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  const gate = await verifyAdminRequest({ capability: 'manage_sources' })
  if (!gate.ok) return gate.response
  const { key } = await params
  const { count, error: countError } = await gate.admin
    .from('curated_companies')
    .select('id', { count: 'exact', head: true })
    .contains('groups', [key])
  if (countError) {
    console.error('[DELETE /api/admin/curated/groups/[key]] 참조 조회 오류:', countError)
    return NextResponse.json({ error: '그룹 참조 기업 수를 확인하지 못했습니다.' }, { status: 500 })
  }
  if ((count ?? 0) > 0) {
    return NextResponse.json({ error: `이 그룹을 참조하는 기업이 ${count}개이므로 삭제할 수 없습니다.`, referencedCompanyCount: count }, { status: 400 })
  }
  const { error } = await gate.admin.from('curated_groups').delete().eq('key', key)
  if (error) {
    console.error('[DELETE /api/admin/curated/groups/[key]] 오류:', error)
    return NextResponse.json({ error: '기업 그룹을 삭제하지 못했습니다.' }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
