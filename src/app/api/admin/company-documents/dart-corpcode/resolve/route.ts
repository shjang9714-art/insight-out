import { NextResponse } from 'next/server'
import { verifyAdminRequest } from '@/lib/admin/verify-admin-request'
import { loadDartCorpCodes } from '@/lib/company-docs/dart-corpcode'
import {
  matchCuratedCompanies,
  type CuratedCompanyInput,
  type MatchCandidate,
} from '@/lib/company-docs/dart-corpcode-match'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

interface CuratedCompanyRow {
  entity_id: string | null
  name: string
  aliases: string[] | null
}

interface EntityDartMapRow {
  entity_id: string
  corp_code: string
}

function isSchemaMissing(error: { code?: string } | null): boolean {
  return error?.code === '42P01' || error?.code === 'PGRST205'
}

/**
 * POST /api/admin/company-documents/dart-corpcode/resolve
 * 큐레이션 주요기업(curated_companies, entity_id 있는 것)을 DART corpCode
 * 전체목록과 매칭해 entity_dart_map에 upsert한다(374). 이미 매핑된 기업은
 * 건드리지 않고, 완전일치·단일 상장 후보만 자동 등록한다.
 */
export async function POST() {
  const auth = await verifyAdminRequest()
  if ('response' in auth) return auth.response
  const { admin } = auth

  const corpCodeResult = await loadDartCorpCodes()
  if (corpCodeResult.skipped) {
    return NextResponse.json({
      skipped: true,
      message: corpCodeResult.message,
      registeredCount: 0,
      unmatchedCount: 0,
      excludedCount: 0,
      alreadyMappedCount: 0,
      registered: [],
      unmatched: [],
    })
  }

  const { data: curatedRows, error: curatedError } = await admin
    .from('curated_companies')
    .select('entity_id, name, aliases')
    .not('entity_id', 'is', null)
    .order('name')
  if (curatedError) {
    console.error('[/api/admin/company-documents/dart-corpcode/resolve] curated_companies 조회 실패:', curatedError)
    return NextResponse.json({ error: '주요기업 목록을 불러오지 못했습니다.' }, { status: 500 })
  }

  const { data: mapRows, error: mapError } = await admin
    .from('entity_dart_map')
    .select('entity_id, corp_code')
  if (mapError) {
    if (isSchemaMissing(mapError)) {
      return NextResponse.json(
        { error: '355-A 기업자료 SQL이 아직 적용되지 않았습니다.' },
        { status: 503 },
      )
    }
    console.error('[/api/admin/company-documents/dart-corpcode/resolve] entity_dart_map 조회 실패:', mapError)
    return NextResponse.json({ error: '기존 DART 매핑을 불러오지 못했습니다.' }, { status: 500 })
  }

  const existingRows = (mapRows ?? []) as EntityDartMapRow[]
  const alreadyMappedEntityIds = new Set(existingRows.map((row) => row.entity_id))
  const usedCorpCodes = new Set(existingRows.map((row) => row.corp_code))

  const allCurated = (curatedRows ?? []) as CuratedCompanyRow[]
  const alreadyMappedCount = allCurated.filter((row) => row.entity_id && alreadyMappedEntityIds.has(row.entity_id)).length

  const pending: CuratedCompanyInput[] = allCurated
    .filter((row): row is CuratedCompanyRow & { entity_id: string } =>
      Boolean(row.entity_id) && !alreadyMappedEntityIds.has(row.entity_id as string))
    .map((row) => ({ entityId: row.entity_id, name: row.name, aliases: row.aliases ?? [] }))

  const results = matchCuratedCompanies(pending, corpCodeResult.entries)

  const toUpsert: { entity_id: string; corp_code: string; corp_name: string }[] = []
  const registered: { entityId: string; name: string; corpCode: string; corpName: string }[] = []
  const unmatched: { entityId: string; name: string; candidates: MatchCandidate[] }[] = []
  let excludedCount = 0

  for (const result of results) {
    if (result.status === 'matched' && result.matched) {
      // corp_code가 이미 다른 entity_id에 등록돼 있으면(정상적으론 발생하지 않아야 함)
      // 자동 등록하지 않고 검토 대상으로 내린다 — 잘못된 재할당 방지.
      if (usedCorpCodes.has(result.matched.corpCode)) {
        unmatched.push({ entityId: result.entityId, name: result.name, candidates: [result.matched] })
        continue
      }
      usedCorpCodes.add(result.matched.corpCode)
      toUpsert.push({ entity_id: result.entityId, corp_code: result.matched.corpCode, corp_name: result.matched.corpName })
      registered.push({
        entityId: result.entityId, name: result.name,
        corpCode: result.matched.corpCode, corpName: result.matched.corpName,
      })
    } else if (result.status === 'candidates') {
      unmatched.push({ entityId: result.entityId, name: result.name, candidates: result.candidates })
    } else {
      excludedCount += 1
    }
  }

  if (toUpsert.length > 0) {
    const { error: upsertError } = await admin
      .from('entity_dart_map')
      .upsert(toUpsert, { onConflict: 'corp_code' })
    if (upsertError) {
      console.error('[/api/admin/company-documents/dart-corpcode/resolve] entity_dart_map upsert 실패:', upsertError)
      return NextResponse.json({ error: 'DART 매핑 저장 중 오류가 발생했습니다.' }, { status: 500 })
    }
  }

  return NextResponse.json({
    skipped: false,
    message: null,
    registeredCount: registered.length,
    unmatchedCount: unmatched.length,
    excludedCount,
    alreadyMappedCount,
    registered,
    unmatched,
  })
}
