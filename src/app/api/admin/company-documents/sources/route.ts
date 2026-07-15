import { NextResponse } from 'next/server'
import { verifyAdminRequest } from '@/lib/admin/verify-admin-request'
import { COMPANY_DOC_SOURCE_KINDS } from '@/lib/company-docs/constants'
import type { CompanyDocumentSourceKind } from '@/lib/types'

export const dynamic = 'force-dynamic'

interface CreateBody {
  entityId?: unknown
  name?: unknown
  url?: unknown
  sourceKind?: unknown
  collectMethod?: unknown
  targetFileTypes?: unknown
  intervalMinutes?: unknown
  autoPublish?: unknown
}

function isSchemaMissing(error: { code?: string } | null): boolean {
  return error?.code === '42P01' || error?.code === 'PGRST205'
}

/**
 * GET /api/admin/company-documents/sources
 * 기업별 소스 레지스트리 전체 목록(355-C ①).
 */
export async function GET() {
  const auth = await verifyAdminRequest()
  if ('response' in auth) return auth.response

  const { data, error } = await auth.admin
    .from('document_sources')
    .select('id, entity_id, name, url, source_kind, collect_method, target_file_types, interval_minutes, last_crawled_at, last_success_at, is_active, error_state, auto_publish, created_at, updated_at, entities(canonical_name)')
    .order('created_at', { ascending: false })

  if (error) {
    if (isSchemaMissing(error)) {
      return NextResponse.json({ sources: [], schemaMissing: true })
    }
    console.error('[company-documents/sources] 목록 조회 실패:', error)
    return NextResponse.json({ error: '소스 목록을 불러오지 못했습니다.' }, { status: 500 })
  }

  return NextResponse.json({ sources: data ?? [] })
}

/**
 * POST /api/admin/company-documents/sources
 * 소스 등록. document_sources는 쓰기 RLS가 없어 admin 클라이언트로만 가능하다.
 */
export async function POST(request: Request) {
  const auth = await verifyAdminRequest()
  if ('response' in auth) return auth.response

  let body: CreateBody
  try {
    body = await request.json() as CreateBody
  } catch {
    return NextResponse.json({ error: '요청 본문이 올바른 JSON이 아닙니다.' }, { status: 400 })
  }

  const entityId = typeof body.entityId === 'string' ? body.entityId.trim() : ''
  const name = typeof body.name === 'string' ? body.name.trim() : ''
  const url = typeof body.url === 'string' ? body.url.trim() : ''
  const sourceKind = typeof body.sourceKind === 'string' ? body.sourceKind : ''
  const collectMethod = typeof body.collectMethod === 'string' ? body.collectMethod.trim() : ''
  const targetFileTypes = Array.isArray(body.targetFileTypes)
    ? body.targetFileTypes.filter((v): v is string => typeof v === 'string')
    : []
  const intervalMinutes = typeof body.intervalMinutes === 'number' && body.intervalMinutes > 0
    ? body.intervalMinutes
    : null
  const autoPublish = body.autoPublish === true

  if (!entityId || !name || !url || !collectMethod) {
    return NextResponse.json({ error: '기업·이름·URL·수집 방법은 필수입니다.' }, { status: 400 })
  }
  if (!COMPANY_DOC_SOURCE_KINDS.includes(sourceKind as CompanyDocumentSourceKind)) {
    return NextResponse.json({ error: '소스 종류가 올바르지 않습니다.' }, { status: 400 })
  }

  const { data, error } = await auth.admin
    .from('document_sources')
    .insert({
      entity_id: entityId,
      name,
      url,
      source_kind: sourceKind,
      collect_method: collectMethod,
      target_file_types: targetFileTypes,
      interval_minutes: intervalMinutes,
      auto_publish: autoPublish,
      is_active: true,
    })
    .select('id, entity_id, name, url, source_kind, collect_method, target_file_types, interval_minutes, last_crawled_at, last_success_at, is_active, error_state, auto_publish, created_at, updated_at, entities(canonical_name)')
    .single()

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: '같은 기업·URL 조합의 소스가 이미 있습니다.' }, { status: 409 })
    }
    console.error('[company-documents/sources] 등록 실패:', error)
    return NextResponse.json({ error: '소스 등록에 실패했습니다.' }, { status: 500 })
  }

  return NextResponse.json({ source: data })
}
