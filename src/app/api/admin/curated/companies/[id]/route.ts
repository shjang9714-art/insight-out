import { NextRequest, NextResponse } from 'next/server'
import { verifyAdminRequest } from '@/lib/admin/verify-admin-request'
import {
  assertGroupKeysExist,
  countCompanyInsightCards,
  inputErrorResponse,
  optionalBoolean,
  optionalInteger,
  optionalTextArray,
  requiredText,
} from '@/lib/admin/curated-admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await verifyAdminRequest({ capability: 'manage_sources' })
  if (!gate.ok) return gate.response
  try {
    const { id } = await params
    const { data: company, error } = await gate.admin.from('curated_companies').select('id, name').eq('id', id).single()
    if (error || !company) return NextResponse.json({ error: '주요기업을 찾을 수 없습니다.' }, { status: 404 })
    const probeName = request.nextUrl.searchParams.get('probeName')?.trim()
    const insightCardCount = await countCompanyInsightCards(gate.admin, company.name)
    return NextResponse.json({
      insightCardCount,
      nameWillChange: Boolean(probeName && probeName !== company.name),
    })
  } catch (error) {
    console.error('[GET /api/admin/curated/companies/[id]] 오류:', error)
    return NextResponse.json({ error: '주간 시사점 건수를 확인하지 못했습니다.' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await verifyAdminRequest({ capability: 'manage_sources' })
  if (!gate.ok) return gate.response

  try {
    const { id } = await params
    const { data: current, error: currentError } = await gate.admin
      .from('curated_companies')
      .select('id, name')
      .eq('id', id)
      .single()
    if (currentError || !current) return NextResponse.json({ error: '주요기업을 찾을 수 없습니다.' }, { status: 404 })

    const body = await request.json() as Record<string, unknown>
    const changes: Record<string, unknown> = {}
    if (Object.hasOwn(body, 'name')) changes.name = requiredText(body.name, '기업명')
    if (Object.hasOwn(body, 'aliases')) changes.aliases = optionalTextArray(body.aliases, '별칭')
    if (Object.hasOwn(body, 'groups')) {
      const groups = optionalTextArray(body.groups, '그룹') ?? []
      await assertGroupKeysExist(gate.admin, groups)
      changes.groups = groups
    }
    if (Object.hasOwn(body, 'is_competitor')) changes.is_competitor = optionalBoolean(body.is_competitor, '경쟁사 여부')
    if (Object.hasOwn(body, 'sort_order')) changes.sort_order = optionalInteger(body.sort_order, '정렬 순서')
    if (Object.hasOwn(body, 'is_active')) changes.is_active = optionalBoolean(body.is_active, '활성 여부')
    if (Object.keys(changes).length === 0) return NextResponse.json({ error: '변경할 항목이 없습니다.' }, { status: 400 })

    const nameChanged = typeof changes.name === 'string' && changes.name !== current.name
    const previousInsightCardCount = nameChanged ? await countCompanyInsightCards(gate.admin, current.name) : 0
    const { data, error } = await gate.admin.from('curated_companies').update(changes).eq('id', id).select('*').single()
    if (error) throw error
    return NextResponse.json({ company: data, previousInsightCardCount })
  } catch (error) {
    const inputError = inputErrorResponse(error)
    if (inputError) return NextResponse.json(inputError, { status: 400 })
    console.error('[PATCH /api/admin/curated/companies/[id]] 오류:', error)
    return NextResponse.json({ error: '주요기업을 수정하지 못했습니다.' }, { status: 500 })
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await verifyAdminRequest({ capability: 'manage_sources' })
  if (!gate.ok) return gate.response
  const { id } = await params
  const { error } = await gate.admin.from('curated_companies').delete().eq('id', id)
  if (error) {
    console.error('[DELETE /api/admin/curated/companies/[id]] 오류:', error)
    return NextResponse.json({ error: '주요기업을 삭제하지 못했습니다.' }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
