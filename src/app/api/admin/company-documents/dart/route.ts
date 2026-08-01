import { verifyAdminRequest } from '@/lib/admin/verify-admin-request'
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { DartApiError } from '@/lib/company-docs/dart'
import {
  CompanyDocsSchemaError,
  ingestDartDisclosures,
} from '@/lib/company-docs/ingest'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

interface CollectBody {
  corpCode?: unknown
  since?: unknown
}


function validateSince(value: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return '수집 시작일 형식이 올바르지 않습니다.'
  const since = new Date(`${value}T00:00:00Z`)
  if (Number.isNaN(since.getTime())) return '수집 시작일이 올바르지 않습니다.'
  const now = new Date()
  if (since > now) return '수집 시작일은 오늘 이후일 수 없습니다.'
  const maxRangeStart = new Date(now)
  maxRangeStart.setUTCFullYear(maxRangeStart.getUTCFullYear() - 1)
  if (since < maxRangeStart) return '한 번에 수집할 수 있는 기간은 최근 1년까지입니다.'
  return null
}

export async function POST(request: Request) {
  const gate = await verifyAdminRequest()
  if (!gate.ok) return gate.response

  let body: CollectBody
  try {
    body = await request.json() as CollectBody
  } catch {
    return NextResponse.json({ error: '요청 본문이 올바른 JSON이 아닙니다.' }, { status: 400 })
  }

  const corpCode = typeof body.corpCode === 'string' ? body.corpCode.trim() : ''
  const since = typeof body.since === 'string' ? body.since.trim() : ''
  if (!/^\d{8}$/.test(corpCode)) {
    return NextResponse.json({ error: '수집할 기업을 선택해주세요.' }, { status: 400 })
  }
  const sinceError = validateSince(since)
  if (sinceError) return NextResponse.json({ error: sinceError }, { status: 400 })

  // 클라이언트가 임의 corp_code를 보내도 등록된 기업만 수집한다.
  const supabase = await createClient()
  const { data: mapping, error: mappingError } = await supabase
    .from('entity_dart_map')
    .select('entity_id')
    .eq('corp_code', corpCode)
    .maybeSingle()
  if (mappingError && (mappingError.code === '42P01' || mappingError.code === 'PGRST205')) {
    return NextResponse.json(
      { error: '355-A 기업자료 SQL이 아직 적용되지 않았습니다.' },
      { status: 503 },
    )
  }
  if (mappingError) {
    console.error('[/api/admin/company-documents/dart] 기업 매핑 조회 실패:', mappingError.message)
    return NextResponse.json({ error: '기업 매핑을 확인하지 못했습니다.' }, { status: 500 })
  }
  if (!mapping) {
    return NextResponse.json({ error: 'DART 수집 대상으로 등록되지 않은 기업입니다.' }, { status: 400 })
  }

  try {
    const result = await ingestDartDisclosures(corpCode, since)
    return NextResponse.json(result)
  } catch (error) {
    if (error instanceof CompanyDocsSchemaError) {
      return NextResponse.json({ error: error.message }, { status: 503 })
    }
    if (error instanceof DartApiError) {
      const status = error.statusCode === '020' ? 429 : 502
      return NextResponse.json({ error: error.message }, { status })
    }
    console.error('[/api/admin/company-documents/dart] 수집 실패:', error)
    return NextResponse.json(
      { error: 'DART 수집 중 오류가 발생했습니다. 서버 설정과 수집 로그를 확인해주세요.' },
      { status: 500 },
    )
  }
}
