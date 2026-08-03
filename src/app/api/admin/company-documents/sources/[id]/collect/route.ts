import { NextResponse, type NextRequest } from 'next/server'
import { verifyAdminRequest } from '@/lib/admin/verify-admin-request'
import { CompanyDocsSchemaError, ingestDartDisclosures } from '@/lib/company-docs/ingest'
import { DartApiError } from '@/lib/company-docs/dart'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

interface RouteParams {
  params: Promise<{ id: string }>
}

function defaultSince(lastSuccessAt: string | null): string {
  const date = lastSuccessAt ? new Date(lastSuccessAt) : new Date()
  if (!lastSuccessAt) date.setDate(date.getDate() - 90)
  return date.toISOString().slice(0, 10)
}

/**
 * POST /api/admin/company-documents/sources/[id]/collect
 * 소스 목록의 [즉시 수집] 버튼. source_kind='API'(DART 연동)만 실제 수집을 실행하고,
 * 그 외 방식은 355-E/355-G 등 후속 커넥터 지시서 범위 — 여기서는 상태만 안내한다.
 */
export async function POST(_request: NextRequest, { params }: RouteParams) {
  const auth = await verifyAdminRequest()
  if (!auth.ok) return auth.response
  const { id } = await params

  const { data: source, error: sourceError } = await auth.admin
    .from('document_sources')
    .select('id, entity_id, source_kind, last_success_at')
    .eq('id', id)
    .maybeSingle()
  if (sourceError) {
    console.error('[company-documents/sources/collect] 소스 조회 실패:', sourceError)
    return NextResponse.json({ error: '소스를 조회하지 못했습니다.' }, { status: 500 })
  }
  if (!source) {
    return NextResponse.json({ error: '소스를 찾을 수 없습니다.' }, { status: 404 })
  }

  if (source.source_kind !== 'API') {
    return NextResponse.json({
      skipped: true,
      message: `"${source.source_kind}" 방식은 아직 자동 수집이 구현되지 않았습니다. 발견 커넥터(네이버/Tavily) 또는 수동 업로드를 이용해주세요.`,
    })
  }

  const { data: mapping, error: mappingError } = await auth.admin
    .from('entity_dart_map')
    .select('corp_code')
    .eq('entity_id', source.entity_id)
    .maybeSingle()
  if (mappingError) {
    console.error('[company-documents/sources/collect] DART 매핑 조회 실패:', mappingError)
    return NextResponse.json({ error: 'DART 기업 매핑을 확인하지 못했습니다.' }, { status: 500 })
  }
  if (!mapping) {
    return NextResponse.json({
      skipped: true,
      message: '이 기업은 DART 기업 매핑(entity_dart_map)이 없어 API 수집을 실행할 수 없습니다.',
    })
  }

  try {
    const result = await ingestDartDisclosures(mapping.corp_code, defaultSince(source.last_success_at))
    await auth.admin
      .from('document_sources')
      .update({
        last_crawled_at: new Date().toISOString(),
        last_success_at: result.skipped ? source.last_success_at : new Date().toISOString(),
        error_state: null,
      })
      .eq('id', id)
    return NextResponse.json(result)
  } catch (error) {
    const message = error instanceof CompanyDocsSchemaError
      ? error.message
      : error instanceof DartApiError
        ? error.message
        : 'DART 수집 중 오류가 발생했습니다.'
    await auth.admin
      .from('document_sources')
      .update({ last_crawled_at: new Date().toISOString(), error_state: message })
      .eq('id', id)
    console.error('[company-documents/sources/collect] 수집 실패:', error)
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
