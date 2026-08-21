import { NextRequest, NextResponse } from 'next/server'
import { verifyAdminRequest } from '@/lib/admin/verify-admin-request'
import {
  assertGroupKeysExist,
  inputErrorResponse,
  optionalBoolean,
  optionalInteger,
  optionalTextArray,
  requiredText,
} from '@/lib/admin/curated-admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const gate = await verifyAdminRequest({ capability: 'manage_sources' })
  if (!gate.ok) return gate.response

  const { data, error } = await gate.admin
    .from('curated_companies')
    .select('id, name, aliases, groups, is_competitor, entity_id, role, sort_order, is_active, created_at')
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true })
    .limit(500)
  if (error) {
    console.error('[GET /api/admin/curated/companies] 오류:', error)
    return NextResponse.json({ error: '주요기업 목록을 불러오지 못했습니다.' }, { status: 500 })
  }
  return NextResponse.json({ companies: data ?? [] })
}

export async function POST(request: NextRequest) {
  const gate = await verifyAdminRequest({ capability: 'manage_sources' })
  if (!gate.ok) return gate.response

  try {
    const body = await request.json() as Record<string, unknown>
    const groups = optionalTextArray(body.groups, '그룹') ?? []
    await assertGroupKeysExist(gate.admin, groups)
    const payload = {
      name: requiredText(body.name, '기업명'),
      aliases: optionalTextArray(body.aliases, '별칭') ?? [],
      groups,
      is_competitor: optionalBoolean(body.is_competitor, '경쟁사 여부') ?? false,
      sort_order: optionalInteger(body.sort_order, '정렬 순서') ?? 0,
      is_active: optionalBoolean(body.is_active, '활성 여부') ?? true,
    }
    const { data, error } = await gate.admin.from('curated_companies').insert(payload).select('*').single()
    if (error) throw error
    return NextResponse.json({ company: data }, { status: 201 })
  } catch (error) {
    const inputError = inputErrorResponse(error)
    if (inputError) return NextResponse.json(inputError, { status: 400 })
    console.error('[POST /api/admin/curated/companies] 오류:', error)
    return NextResponse.json({ error: '주요기업을 저장하지 못했습니다.' }, { status: 500 })
  }
}
