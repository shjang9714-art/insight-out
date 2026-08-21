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

export async function GET() {
  const gate = await verifyAdminRequest({ capability: 'manage_sources' })
  if (!gate.ok) return gate.response
  const { data, error } = await gate.admin
    .from('curated_groups')
    .select('key, label, kind, display_mode, sort_order, is_active, created_at')
    .order('sort_order', { ascending: true })
    .order('label', { ascending: true })
    .limit(200)
  if (error) {
    console.error('[GET /api/admin/curated/groups] 오류:', error)
    return NextResponse.json({ error: '기업 그룹 목록을 불러오지 못했습니다.' }, { status: 500 })
  }
  return NextResponse.json({ groups: data ?? [] })
}

export async function POST(request: NextRequest) {
  const gate = await verifyAdminRequest({ capability: 'manage_sources' })
  if (!gate.ok) return gate.response
  try {
    const body = await request.json() as Record<string, unknown>
    const payload = {
      key: requiredText(body.key, '그룹 key'),
      label: requiredText(body.label, '그룹명'),
      kind: groupKind(body.kind),
      display_mode: groupDisplayMode(body.display_mode ?? 'always'),
      sort_order: optionalInteger(body.sort_order, '정렬 순서') ?? 0,
      is_active: optionalBoolean(body.is_active, '활성 여부') ?? true,
    }
    const { data, error } = await gate.admin.from('curated_groups').insert(payload).select('*').single()
    if (error) throw error
    return NextResponse.json({ group: data }, { status: 201 })
  } catch (error) {
    const inputError = inputErrorResponse(error)
    if (inputError) return NextResponse.json(inputError, { status: 400 })
    console.error('[POST /api/admin/curated/groups] 오류:', error)
    return NextResponse.json({ error: '기업 그룹을 저장하지 못했습니다.' }, { status: 500 })
  }
}
