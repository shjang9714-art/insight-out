import type { SupabaseClient } from '@supabase/supabase-js'
import type { CompanyDocumentType } from '@/lib/types'

/**
 * 355-B — 사용자 탭(기업동향 > 기업·기술 자료) 조회 헬퍼.
 * 공개 조건: contents.status='published'(RLS로 이미 강제) + company_documents.review_status='none'
 * (355-C 검토함 승인 시 review_status를 'none'으로 되돌리는 규약, review/[contentId]/route.ts 참고).
 * company_documents 자체엔 review_status RLS 필터가 없어 여기서 방어적으로 다시 건다.
 */

export interface CompanyDocumentListItem {
  contentId: string
  title: string
  summaryKo: string | null
  thumbnailUrl: string | null
  originalUrl: string | null
  publishedAt: string | null
  entityId: string | null
  entityName: string | null
  docType: CompanyDocumentType
  isOfficial: boolean
}

interface CompanyDocumentContentRow {
  title: string
  summary_ko: string | null
  thumbnail_url: string | null
  original_url: string | null
  published_at: string | null
}

interface CompanyDocumentEntityRow {
  canonical_name: string
}

interface CompanyDocumentRow {
  content_id: string
  entity_id: string | null
  doc_type: CompanyDocumentType
  is_official: boolean
  published_on: string | null
  contents: CompanyDocumentContentRow | CompanyDocumentContentRow[] | null
  entities: CompanyDocumentEntityRow | CompanyDocumentEntityRow[] | null
}

function oneOf<T>(value: T | T[] | null): T | null {
  if (Array.isArray(value)) return value[0] ?? null
  return value
}

function normalizeRow(row: CompanyDocumentRow): CompanyDocumentListItem {
  const contents = oneOf(row.contents)
  const entity = oneOf(row.entities)
  return {
    contentId: row.content_id,
    title: contents?.title ?? '(제목 없음)',
    summaryKo: contents?.summary_ko ?? null,
    thumbnailUrl: contents?.thumbnail_url ?? null,
    originalUrl: contents?.original_url ?? null,
    publishedAt: row.published_on ?? contents?.published_at ?? null,
    entityId: row.entity_id,
    entityName: entity?.canonical_name ?? null,
    docType: row.doc_type,
    isOfficial: row.is_official,
  }
}

interface GetPublishedCompanyDocumentsOptions {
  contentId?: string
  entityId?: string
  docType?: CompanyDocumentType
  limit?: number
}

export async function getPublishedCompanyDocuments(
  supabase: SupabaseClient,
  { contentId, entityId, docType, limit = 30 }: GetPublishedCompanyDocumentsOptions = {}
): Promise<CompanyDocumentListItem[]> {
  let query = supabase
    .from('company_documents')
    .select(`
      content_id, entity_id, doc_type, is_official, published_on,
      contents!company_documents_content_id_fkey(title, summary_ko, thumbnail_url, original_url, published_at),
      entities(canonical_name)
    `)
    .eq('review_status', 'none')
    .eq('access_scope', 'public')
    .order('published_on', { ascending: false, nullsFirst: false })
    .limit(limit)

  if (entityId) query = query.eq('entity_id', entityId)
  if (contentId) query = query.eq('content_id', contentId)
  if (docType) query = query.eq('doc_type', docType)

  const { data, error } = await query
  if (error) {
    console.error('[company-docs/query] 문서 목록 조회 실패:', error.message)
    return []
  }
  return (data as unknown as CompanyDocumentRow[] ?? [])
    .filter((row) => Boolean(oneOf(row.contents)))
    .map(normalizeRow)
}

export interface CompanyDocumentEntityOption {
  entityId: string
  entityName: string
}

export async function getCompanyDocumentEntityOptions(
  supabase: SupabaseClient
): Promise<CompanyDocumentEntityOption[]> {
  const { data, error } = await supabase
    .from('company_documents')
    .select('entity_id, entities(canonical_name)')
    .eq('review_status', 'none')
    .not('entity_id', 'is', null)

  if (error) {
    console.error('[company-docs/query] 기업 필터 조회 실패:', error.message)
    return []
  }

  const seen = new Map<string, string>()
  for (const row of (data as unknown as { entity_id: string | null; entities: CompanyDocumentEntityRow | CompanyDocumentEntityRow[] | null }[]) ?? []) {
    const entity = oneOf(row.entities)
    if (row.entity_id && entity?.canonical_name && !seen.has(row.entity_id)) {
      seen.set(row.entity_id, entity.canonical_name)
    }
  }
  return Array.from(seen.entries())
    .map(([entityId, entityName]) => ({ entityId, entityName }))
    .sort((a, b) => a.entityName.localeCompare(b.entityName, 'ko'))
}

export interface CompanyDocumentStats {
  total: number
  newThisWeek: number
}

export async function getCompanyDocumentStats(
  supabase: SupabaseClient
): Promise<CompanyDocumentStats> {
  const weekAgo = new Date()
  weekAgo.setDate(weekAgo.getDate() - 7)
  const weekAgoIso = weekAgo.toISOString().slice(0, 10)

  const [{ count: total }, { count: newThisWeek }] = await Promise.all([
    supabase.from('company_documents').select('content_id', { count: 'exact', head: true }).eq('review_status', 'none'),
    supabase.from('company_documents').select('content_id', { count: 'exact', head: true }).eq('review_status', 'none').gte('published_on', weekAgoIso),
  ])

  return { total: total ?? 0, newThisWeek: newThisWeek ?? 0 }
}
