import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'

// 526 — pending 은 자동 품질 격리소인데 출구가 없었다(두 달간 rejected 13건, 입구 하루 125건).
// 계열마다 "재판정이 다시 돌 여지"가 다르므로 조건을 하나로 묶지 않는다.
// 실측: low_relevance 2,604건 중 2,579건이 body_retry_count=0 — 관련도 판정은 본문 보강
// 대상이 아니라 재시도가 아예 안 돈다. "재시도 소진" 조건을 걸면 가장 큰 유입원이 영구히
// 만료되지 않는다. 반대로 본문 계열은 경과일만으로 자르면 보강 중인 건을 죽인다.
export const EXPIRE_BODY_MIN_RETRY = 3
export const EXPIRE_BODY_AFTER_DAYS = 14
export const EXPIRE_RELEVANCE_AFTER_DAYS = 30
export const EXPIRE_BATCH_SIZE = 500

const BODY_REASONS = ['body_short', 'body_truncated', 'body_missing', 'extract_failed']
const RELEVANCE_REASONS = ['low_relevance', 'llm_irrelevant', 'excluded_rule']

export interface ExpirePendingResult {
  ok: true
  expired: { body: number; relevance: number; unknown: number }
  total: number
  batchCapped: boolean
  remaining: number
}

function daysAgoIso(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString()
}

async function fetchBodyCandidates(admin: SupabaseClient, cutoff: string, limit: number): Promise<string[]> {
  if (limit <= 0) return []
  const { data, error } = await admin
    .from('contents')
    .select('id')
    .eq('status', 'pending')
    .is('deleted_at', null)
    .in('review_reason', BODY_REASONS)
    .gte('body_retry_count', EXPIRE_BODY_MIN_RETRY)
    .lte('collected_at', cutoff)
    .limit(limit)
  if (error) { console.error('[검토대기 만료] 본문 계열 대상 조회 실패:', error.message); return [] }
  return (data ?? []).map(r => r.id as string)
}

async function fetchRelevanceCandidates(admin: SupabaseClient, cutoff: string, limit: number): Promise<string[]> {
  if (limit <= 0) return []
  const { data, error } = await admin
    .from('contents')
    .select('id')
    .eq('status', 'pending')
    .is('deleted_at', null)
    .in('review_reason', RELEVANCE_REASONS)
    .lte('collected_at', cutoff)
    .limit(limit)
  if (error) { console.error('[검토대기 만료] 관련도 계열 대상 조회 실패:', error.message); return [] }
  return (data ?? []).map(r => r.id as string)
}

async function fetchUnknownCandidates(admin: SupabaseClient, cutoff: string, limit: number): Promise<string[]> {
  if (limit <= 0) return []
  const { data, error } = await admin
    .from('contents')
    .select('id')
    .eq('status', 'pending')
    .is('deleted_at', null)
    .is('review_reason', null)
    .lte('collected_at', cutoff)
    .limit(limit)
  if (error) { console.error('[검토대기 만료] 사유없음 대상 조회 실패:', error.message); return [] }
  return (data ?? []).map(r => r.id as string)
}

/** 대상 id 목록을 status='rejected' 로 만료시킨다. review_reason 은 건드리지 않는다 — 왜 갇혀 있었는지가 유일한 단서다. */
async function expireIds(admin: SupabaseClient, ids: string[]): Promise<number> {
  if (ids.length === 0) return 0
  const { error } = await admin
    .from('contents')
    .update({ status: 'rejected' })
    .in('id', ids)
    .eq('status', 'pending')
    .is('deleted_at', null)
  if (error) { console.error('[검토대기 만료] 만료 처리 실패:', error.message); return 0 }
  return ids.length
}

/**
 * 526 — pending 검토대기 자동 만료.
 *
 * contents 에 WHEN 절 없는 BEFORE UPDATE 트리거(contents_search_vector_trigger)가 있어
 * status 만 바꿔도 행마다 search_vector 가 재계산된다. 대량 업데이트는 maxDuration
 * 하드킬에 걸리므로(509-A 실패 사례, 523-B 에서 분리한 그 유형) 1회 실행당
 * EXPIRE_BATCH_SIZE 상한을 셋(본문/관련도/사유없음) 전체가 공유한다.
 */
export async function expirePendingContents(admin: SupabaseClient): Promise<ExpirePendingResult> {
  const bodyCutoff = daysAgoIso(EXPIRE_BODY_AFTER_DAYS)
  const relevanceCutoff = daysAgoIso(EXPIRE_RELEVANCE_AFTER_DAYS)

  let budget = EXPIRE_BATCH_SIZE

  const bodyIds = await fetchBodyCandidates(admin, bodyCutoff, budget)
  budget -= bodyIds.length

  const relevanceIds = await fetchRelevanceCandidates(admin, relevanceCutoff, budget)
  budget -= relevanceIds.length

  const unknownIds = await fetchUnknownCandidates(admin, relevanceCutoff, budget)
  budget -= unknownIds.length

  const [body, relevance, unknown] = await Promise.all([
    expireIds(admin, bodyIds),
    expireIds(admin, relevanceIds),
    expireIds(admin, unknownIds),
  ])
  const total = body + relevance + unknown

  // 만료 처리 후 세는 것이 핵심 — 방금 rejected 로 바뀐 행은 더는 status='pending' 조건에
  // 걸리지 않으므로, 아래 count 는 이번 배치가 처리하지 못한 "진짜 남은" 건수다.
  // 전체 행을 select 하지 않고 count:'exact', head:true 로 서버 집계한다(1000행 상한 회피).
  const [bodyRemaining, relevanceRemaining, unknownRemaining] = await Promise.all([
    admin.from('contents').select('id', { count: 'exact', head: true })
      .eq('status', 'pending').is('deleted_at', null)
      .in('review_reason', BODY_REASONS)
      .gte('body_retry_count', EXPIRE_BODY_MIN_RETRY)
      .lte('collected_at', bodyCutoff),
    admin.from('contents').select('id', { count: 'exact', head: true })
      .eq('status', 'pending').is('deleted_at', null)
      .in('review_reason', RELEVANCE_REASONS)
      .lte('collected_at', relevanceCutoff),
    admin.from('contents').select('id', { count: 'exact', head: true })
      .eq('status', 'pending').is('deleted_at', null)
      .is('review_reason', null)
      .lte('collected_at', relevanceCutoff),
  ])
  const remaining = (bodyRemaining.count ?? 0) + (relevanceRemaining.count ?? 0) + (unknownRemaining.count ?? 0)

  return {
    ok: true,
    expired: { body, relevance, unknown },
    total,
    // batchCapped 가 이 지시서에서 가장 중요한 필드다. 없으면 "500건 처리 성공"이
    // "다 처리했다"로 읽힌다 — 이 코드베이스에서 반복돼 온 조용한 절단 패턴.
    batchCapped: total >= EXPIRE_BATCH_SIZE,
    remaining,
  }
}
