import type { SupabaseClient } from '@supabase/supabase-js'

/** near-dup 후보 조회 결과 타입 */
export interface SimilarityCandidate {
  id: string
  title: string
  published_at: string | null
  cluster_id: string | null
}

/**
 * 원문 URL 존재 여부(멱등 1차 — 가장 신뢰).
 * insert 가 사용하는 original_url 과 동일 값으로 select → 결정적 중복 판정.
 */
export async function findByUrl(
  admin: SupabaseClient,
  url: string
): Promise<boolean> {
  if (!url) return false
  const { data } = await admin
    .from('contents')
    .select('id')
    .eq('original_url', url)
    .limit(1)
  return Array.isArray(data) && data.length > 0
}

/**
 * 제목 해시 완전일치 중복 확인.
 * hash 가 null 이면 false. (maybeSingle 은 다중 일치 시 에러+null 을 반환해
 *  중복을 놓치므로 limit(1) 배열로 판정)
 */
export async function findByTitleHash(
  admin: SupabaseClient,
  hash: string | null
): Promise<boolean> {
  if (!hash) return false
  const { data } = await admin
    .from('contents')
    .select('id')
    .eq('title_hash', hash)
    .limit(1)
  return Array.isArray(data) && data.length > 0
}

/**
 * 본문 해시 완전일치 중복 확인.
 * hash 가 null 이면 false.
 */
export async function findByBodyHash(
  admin: SupabaseClient,
  hash: string | null
): Promise<boolean> {
  if (!hash) return false
  const { data } = await admin
    .from('contents')
    .select('id')
    .eq('body_hash', hash)
    .limit(1)
  return Array.isArray(data) && data.length > 0
}

/**
 * near-dup 전수비교 회피용 후보 좁히기.
 * 기준 시각 기준 최근 sinceDays 일 이내 '뉴스' 카테고리 행만 조회.
 * - published_at 인덱스(contents_published_at_idx) 활용.
 * - limit 500: 하루 수백 건 수준에서 성능 안전.
 *
 * @param publishedAt 새 기사의 발행일(ISO). null/undefined 이면 현재 시각 기준.
 * @param sinceDays 과거 며칠까지 후보로 볼지 (기본 2일)
 */
export async function findSimilarCandidates(
  admin: SupabaseClient,
  publishedAt: string | null | undefined,
  sinceDays = 2
): Promise<SimilarityCandidate[]> {
  const baseMs = publishedAt ? new Date(publishedAt).getTime() : Date.now()
  // published_at 이 null 인 행을 포함하기 위해 collected_at 도 OR 조건 추가 불필요
  // — null 행은 단독으로만 취급(그룹핑 후보 제외). 날짜 없는 기사는 비교 생략.
  if (isNaN(baseMs)) return []
  const sinceIso = new Date(baseMs - sinceDays * 24 * 60 * 60 * 1000).toISOString()

  const { data, error } = await admin
    .from('contents')
    .select('id, title, published_at, cluster_id')
    .eq('category', '뉴스')
    .gte('published_at', sinceIso)
    .limit(500)

  if (error) {
    console.error('[크롤러] 유사 후보 조회 오류:', error.message)
    return []
  }

  return (data ?? []) as SimilarityCandidate[]
}
