import { NextResponse, type NextRequest } from 'next/server'
import { verifyAdminRequest } from '@/lib/admin/verify-admin-request'
import { COMPANY_DOC_SOURCE_KINDS } from '@/lib/company-docs/constants'
import type { CompanyDocumentSourceKind } from '@/lib/types'

export const dynamic = 'force-dynamic'

interface RouteParams {
  params: Promise<{ id: string }>
}

interface UpdateBody {
  name?: unknown
  url?: unknown
  sourceKind?: unknown
  collectMethod?: unknown
  targetFileTypes?: unknown
  intervalMinutes?: unknown
  autoPublish?: unknown
  isActive?: unknown
}

/**
 * PATCH /api/admin/company-documents/sources/[id]
 * 소스 편집·비활성 토글. 부분 업데이트(전달된 필드만 반영).
 */
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const auth = await verifyAdminRequest({ capability: 'manage_sources' })
  if (!auth.ok) return auth.response
  const { id } = await params

  let body: UpdateBody
  try {
    body = await request.json() as UpdateBody
  } catch {
    return NextResponse.json({ error: '요청 본문이 올바른 JSON이 아닙니다.' }, { status: 400 })
  }

  const patch: Record<string, unknown> = {}
  if (typeof body.name === 'string' && body.name.trim()) patch.name = body.name.trim()
  if (typeof body.url === 'string' && body.url.trim()) patch.url = body.url.trim()
  if (typeof body.sourceKind === 'string') {
    if (!COMPANY_DOC_SOURCE_KINDS.includes(body.sourceKind as CompanyDocumentSourceKind)) {
      return NextResponse.json({ error: '소스 종류가 올바르지 않습니다.' }, { status: 400 })
    }
    patch.source_kind = body.sourceKind
  }
  if (typeof body.collectMethod === 'string' && body.collectMethod.trim()) patch.collect_method = body.collectMethod.trim()
  if (Array.isArray(body.targetFileTypes)) {
    patch.target_file_types = body.targetFileTypes.filter((v): v is string => typeof v === 'string')
  }
  if (body.intervalMinutes === null) patch.interval_minutes = null
  else if (typeof body.intervalMinutes === 'number' && body.intervalMinutes > 0) patch.interval_minutes = body.intervalMinutes
  if (typeof body.autoPublish === 'boolean') patch.auto_publish = body.autoPublish
  if (typeof body.isActive === 'boolean') patch.is_active = body.isActive

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: '변경할 내용이 없습니다.' }, { status: 400 })
  }

  const { data, error } = await auth.admin
    .from('document_sources')
    .update(patch)
    .eq('id', id)
    .select('id, entity_id, name, url, source_kind, collect_method, target_file_types, interval_minutes, last_crawled_at, last_success_at, is_active, error_state, auto_publish, created_at, updated_at, entities(canonical_name)')
    .single()

  if (error) {
    console.error('[company-documents/sources] 수정 실패:', error)
    return NextResponse.json({ error: '소스 수정에 실패했습니다.' }, { status: 500 })
  }

  return NextResponse.json({ source: data })
}

/**
 * DELETE /api/admin/company-documents/sources/[id]
 * 소스 삭제. 이미 적재된 company_documents는 보존한다(FK 없음, source_id 참조 컬럼 자체가 없음).
 */
export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  const auth = await verifyAdminRequest({ capability: 'manage_sources' })
  if (!auth.ok) return auth.response
  const { id } = await params

  const { error } = await auth.admin.from('document_sources').delete().eq('id', id)
  if (error) {
    console.error('[company-documents/sources] 삭제 실패:', error)
    return NextResponse.json({ error: '소스 삭제에 실패했습니다.' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
