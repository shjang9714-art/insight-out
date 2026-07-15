import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { titleHash } from '@/lib/crawler/normalize'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  fetchDisclosures,
  normalizeDisclosure,
  type NormalizedDartDocument,
} from '@/lib/company-docs/dart'

interface EntityDartMapRow {
  entity_id: string
  corp_code: string
  corp_name: string
}

export interface DartIngestResult {
  fetchedCount: number
  newCount: number
  duplicateCount: number
  unmatchedCount: number
  failedCount: number
  skipped: boolean
  message: string | null
}

export class CompanyDocsSchemaError extends Error {
  constructor() {
    super('355-A 기업자료 SQL이 아직 적용되지 않았습니다. SQL 적용 후 다시 시도해주세요.')
    this.name = 'CompanyDocsSchemaError'
  }
}

function isSchemaMissing(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false
  return error.code === '42P01'
    || error.code === '42704'
    || error.message?.includes('company_documents') === true
    || error.message?.includes('entity_dart_map') === true
    || error.message?.includes('기업자료') === true
}

async function writeCrawlLog(
  admin: SupabaseClient,
  result: DartIngestResult,
  startedAt: string,
  errorMessage?: string,
): Promise<void> {
  const status = errorMessage
    ? (result.newCount > 0 ? 'partial' : 'failed')
    : (result.failedCount > 0 ? 'partial' : 'success')
  const { error } = await admin.from('crawl_logs').insert({
    source_id: null,
    status,
    fetched_count: result.fetchedCount,
    inserted_count: result.newCount,
    duplicate_count: result.duplicateCount,
    held_count: result.unmatchedCount + result.failedCount,
    error_message: errorMessage ?? null,
    started_at: startedAt,
    finished_at: new Date().toISOString(),
  })
  if (error) console.error('[기업자료/DART] crawl_logs 기록 실패:', error.message)
}

async function resolveDartMap(
  admin: SupabaseClient,
  corpCode: string,
): Promise<EntityDartMapRow | null> {
  const { data, error } = await admin
    .from('entity_dart_map')
    .select('entity_id, corp_code, corp_name')
    .eq('corp_code', corpCode)
    .maybeSingle()
  if (isSchemaMissing(error)) throw new CompanyDocsSchemaError()
  if (error) throw new Error(`DART 기업 매핑을 확인하지 못했습니다: ${error.message}`)
  return data as EntityDartMapRow | null
}

async function isDuplicate(admin: SupabaseClient, rceptNo: string): Promise<boolean> {
  const { data, error } = await admin
    .from('company_documents')
    .select('content_id')
    .eq('dart_rcept_no', rceptNo)
    .maybeSingle()
  if (isSchemaMissing(error)) throw new CompanyDocsSchemaError()
  if (error) throw new Error(`DART 중복 여부를 확인하지 못했습니다: ${error.message}`)
  return data !== null
}

async function insertDisclosure(
  admin: SupabaseClient,
  document: NormalizedDartDocument,
  entityId: string | null,
): Promise<'inserted' | 'duplicate' | 'unmatched'> {
  if (await isDuplicate(admin, document.rceptNo)) return 'duplicate'

  const isMatched = entityId !== null
  const contentRow = {
    category: '기업자료',
    title: document.title,
    author: document.author || null,
    original_url: document.originalUrl,
    original_language: 'ko',
    title_hash: titleHash(document.title),
    published_at: `${document.publishedOn}T00:00:00+09:00`,
    status: isMatched ? 'published' : 'pending',
  }
  const { data: content, error: contentError } = await admin
    .from('contents')
    .insert(contentRow)
    .select('id')
    .single()
  if (contentError?.code === '23505') return 'duplicate'
  if (isSchemaMissing(contentError)) throw new CompanyDocsSchemaError()
  if (contentError || !content) {
    throw new Error(`기업자료 콘텐츠를 저장하지 못했습니다: ${contentError?.message ?? '식별자 없음'}`)
  }

  const contentId = (content as { id: string }).id
  const { error: documentError } = await admin.from('company_documents').insert({
    content_id: contentId,
    entity_id: entityId,
    doc_type: document.docType,
    doc_group: document.docGroup,
    is_official: document.isOfficial,
    source_kind: document.sourceKind,
    published_on: document.publishedOn,
    official_status: document.officialStatus,
    access_scope: 'public',
    ingest_status: 'auto',
    review_status: isMatched ? 'none' : '검토대기',
    dart_rcept_no: document.rceptNo,
  })
  if (documentError) {
    await admin.from('contents').delete().eq('id', contentId)
    if (documentError.code === '23505') return 'duplicate'
    if (isSchemaMissing(documentError)) throw new CompanyDocsSchemaError()
    throw new Error(`기업자료 메타데이터를 저장하지 못했습니다: ${documentError.message}`)
  }

  if (entityId) {
    const { error: entityError } = await admin.from('content_entities').upsert({
      content_id: contentId,
      entity_id: entityId,
      source: 'dart',
      score: 1,
    }, { onConflict: 'content_id,entity_id' })
    if (entityError) {
      await admin.from('contents').delete().eq('id', contentId)
      throw new Error(`기업자료 엔티티를 연결하지 못했습니다: ${entityError.message}`)
    }
  }

  return isMatched ? 'inserted' : 'unmatched'
}

/** 매핑된 한 기업의 DART 공시를 조회하고 기업자료 파이프라인에 적재한다. */
export async function ingestDartDisclosures(corpCode: string, since: string): Promise<DartIngestResult> {
  const admin = createAdminClient()
  const startedAt = new Date().toISOString()
  const result: DartIngestResult = {
    fetchedCount: 0,
    newCount: 0,
    duplicateCount: 0,
    unmatchedCount: 0,
    failedCount: 0,
    skipped: false,
    message: null,
  }

  try {
    const mapping = await resolveDartMap(admin, corpCode)
    const fetched = await fetchDisclosures(corpCode, since)
    if (fetched.skipped) {
      return { ...result, skipped: true, message: fetched.message }
    }
    result.fetchedCount = fetched.disclosures.length

    for (const disclosure of fetched.disclosures) {
      try {
        const outcome = await insertDisclosure(
          admin,
          normalizeDisclosure(disclosure),
          mapping?.entity_id ?? null,
        )
        if (outcome === 'inserted') result.newCount += 1
        if (outcome === 'duplicate') result.duplicateCount += 1
        if (outcome === 'unmatched') {
          result.newCount += 1
          result.unmatchedCount += 1
        }
      } catch (error) {
        if (error instanceof CompanyDocsSchemaError) throw error
        result.failedCount += 1
        console.error(`[기업자료/DART] ${disclosure.rceptNo} 적재 실패:`, error)
      }
    }

    result.message = result.failedCount > 0
      ? `${result.failedCount}건을 저장하지 못해 검토가 필요합니다.`
      : null
    await writeCrawlLog(admin, result, startedAt, result.message ?? undefined)
    return result
  } catch (error) {
    if (!(error instanceof CompanyDocsSchemaError)) {
      const message = error instanceof Error ? error.message : 'DART 수집 중 알 수 없는 오류가 발생했습니다.'
      await writeCrawlLog(admin, result, startedAt, message)
    }
    throw error
  }
}
