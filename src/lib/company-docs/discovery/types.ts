import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { normalizeUrl, titleHash } from '@/lib/crawler/normalize'
import { DOC_GROUP_BY_TYPE } from '@/lib/company-docs/constants'
import type { CompanyDocumentSourceKind, CompanyDocumentType } from '@/lib/types'

/**
 * 355-F 기업자료 발견 커넥터 — 공통 타입·저장 로직.
 *
 * 발견(discovery) = 후보 URL을 찾는 것. 원천이 아니다.
 * 저장 시 항상 is_official=false · review_status='검토대기' · 원문(본문) 저장 없음(링크·메타만).
 */

export interface Candidate {
  url: string
  title: string
  snippet?: string
  source_kind: CompanyDocumentSourceKind
  entity_hint?: string
  doc_type_hint?: CompanyDocumentType
  /** 'YYYY-MM-DD' */
  published_hint?: string
  provider: 'naver' | 'tavily'
}

export interface DiscoverySearchInput {
  entityName: string
  /** Tavily 전용 자유 프롬프트. 네이버는 내부 힌트 쿼리를 사용해 무시한다. */
  query?: string
  admin: SupabaseClient
}

export interface DiscoveryResult {
  candidates: Candidate[]
  /** 키 미설정·쿼터 소진 등으로 실행하지 않았으면 true */
  skipped: boolean
  message: string | null
}

export interface DiscoveryProvider {
  key: 'naver' | 'tavily'
  search(input: DiscoverySearchInput): Promise<DiscoveryResult>
}

// ─── 쿼터 카운터 — 신규 SQL 없이 기존 llm_usage(provider, period, calls) 재사용 ──────
// provider 값을 'naver-discovery'/'tavily-discovery'로 구분해 LLM 사용량과 섞이지 않게 한다.

export function todayKst(): string {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' })
}

export function thisMonthKst(): string {
  return todayKst().slice(0, 7)
}

export async function readQuotaCalls(
  admin: SupabaseClient,
  provider: string,
  period: string,
): Promise<number> {
  const { data, error } = await admin
    .from('llm_usage')
    .select('calls')
    .eq('provider', provider)
    .eq('period', period)
    .maybeSingle()
  if (error) {
    console.error(`[기업자료/발견] 쿼터 조회 실패 provider=${provider}:`, error.message)
    return 0
  }
  return (data as { calls: number } | null)?.calls ?? 0
}

export async function recordQuotaCalls(
  admin: SupabaseClient,
  provider: string,
  period: string,
  calls: number,
): Promise<void> {
  if (calls <= 0) return
  const { error } = await admin.rpc('increment_llm_usage', {
    p_provider: provider,
    p_period: period,
    p_tokens: 0,
    p_calls: calls,
  })
  if (error) console.error(`[기업자료/발견] 쿼터 기록 실패 provider=${provider}:`, error.message)
}

// ─── 후보 저장 ────────────────────────────────────────────────────────────────

const DEFAULT_DOC_TYPE: CompanyDocumentType = '전략·보고서'

export interface SaveCandidatesResult {
  savedCount: number
  duplicateCount: number
  failedCount: number
}

/**
 * 후보를 contents(status='pending') + company_documents(is_official=false,
 * review_status='검토대기')로 적재한다. 원문 본문은 절대 저장하지 않는다(링크·메타만).
 * 중복은 정규화 URL 기준(같은 정규화 URL이 배치 내 중복이거나 이미 저장된 원문 URL과 같으면 skip).
 */
export async function saveCandidates(
  admin: SupabaseClient,
  entityId: string | null,
  candidates: Candidate[],
): Promise<SaveCandidatesResult> {
  const result: SaveCandidatesResult = { savedCount: 0, duplicateCount: 0, failedCount: 0 }
  const seenInBatch = new Set<string>()

  for (const candidate of candidates) {
    const normalized = normalizeUrl(candidate.url)
    if (seenInBatch.has(normalized)) {
      result.duplicateCount += 1
      continue
    }
    seenInBatch.add(normalized)

    const { data: existing } = await admin
      .from('contents')
      .select('id')
      .eq('original_url', candidate.url)
      .is('deleted_at', null)
      .maybeSingle()
    if (existing) {
      result.duplicateCount += 1
      continue
    }

    const docType = candidate.doc_type_hint ?? DEFAULT_DOC_TYPE
    const docGroup = DOC_GROUP_BY_TYPE[docType]

    const { data: content, error: contentError } = await admin
      .from('contents')
      .insert({
        category: '기업자료',
        title: candidate.title,
        summary_ko: candidate.snippet ?? null,
        original_url: candidate.url,
        original_language: 'ko',
        title_hash: titleHash(candidate.title),
        published_at: candidate.published_hint ? `${candidate.published_hint}T00:00:00+09:00` : null,
        status: 'pending',
      })
      .select('id')
      .single()

    if (contentError?.code === '23505') {
      result.duplicateCount += 1
      continue
    }
    if (contentError || !content) {
      console.error('[기업자료/발견] contents 저장 실패:', contentError?.message)
      result.failedCount += 1
      continue
    }

    const contentId = (content as { id: string }).id
    const { error: docError } = await admin.from('company_documents').insert({
      content_id: contentId,
      entity_id: entityId,
      doc_type: docType,
      doc_group: docGroup,
      is_official: false,
      source_kind: candidate.source_kind,
      official_status: '발견 후보(미검증)',
      access_scope: 'public',
      ingest_status: 'discovery',
      review_status: '검토대기',
    })

    if (docError) {
      await admin.from('contents').delete().eq('id', contentId)
      if (docError.code === '23505') {
        result.duplicateCount += 1
        continue
      }
      console.error('[기업자료/발견] company_documents 저장 실패:', docError.message)
      result.failedCount += 1
      continue
    }

    if (entityId) {
      const { error: entityError } = await admin.from('content_entities').upsert({
        content_id: contentId,
        entity_id: entityId,
        source: `${candidate.provider}-discovery`,
        score: 0.5,
      }, { onConflict: 'content_id,entity_id' })
      if (entityError) console.error('[기업자료/발견] content_entities 연결 실패:', entityError.message)
    }

    result.savedCount += 1
  }

  return result
}
