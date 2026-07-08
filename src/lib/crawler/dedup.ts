import type { SupabaseClient } from '@supabase/supabase-js'

/** near-dup 후보 조회 결과 타입 */
export interface SimilarityCandidate {
  id: string
  title: string
  published_at: string | null
  collected_at: string
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
 * collected_at 기준(항상 존재)으로 최근 sinceDays 일 이내 '뉴스' 카테고리 행 조회.
 * published_at 이 null 인 RSS 기사도 후보에 포함 → 클러스터 형성 가능.
 * - limit 500: 하루 수백 건 수준에서 성능 안전.
 *
 * @param publishedAt 새 기사의 발행일(ISO). null/undefined 이면 현재 시각 기준.
 * @param sinceDays 과거 며칠까지 후보로 볼지 (기본 3일 — 같은 사건 보도 포착)
 */
export async function findSimilarCandidates(
  admin: SupabaseClient,
  publishedAt: string | null | undefined,
  sinceDays = 3
): Promise<SimilarityCandidate[]> {
  const baseMs = publishedAt ? new Date(publishedAt).getTime() : Date.now()
  if (isNaN(baseMs)) return []
  const sinceIso = new Date(baseMs - sinceDays * 24 * 60 * 60 * 1000).toISOString()

  const { data, error } = await admin
    .from('contents')
    .select('id, title, published_at, collected_at, cluster_id')
    .eq('category', '뉴스')
    .gte('collected_at', sinceIso)
    .order('collected_at', { ascending: false })
    .limit(500)

  if (error) {
    console.error('[크롤러] 유사 후보 조회 오류:', error.message)
    return []
  }

  return (data ?? []) as SimilarityCandidate[]
}

/** near-dup 재클러스터링 백필(220)용 확장 후보 — 대표 선정에 필요한 신호 포함. */
export interface SimilarityCandidateWithBody extends SimilarityCandidate {
  body_original: string | null
  source_id: string | null
  importance_score: number | null
  thumbnail_url: string | null
  trust_tier: number | null
}

/**
 * findSimilarCandidates 확장판(220) — 본문·대표선정 신호(trust_tier·importance_score·
 * thumbnail_url) 포함. 백필 전용(삽입 hot-path 는 기존 findSimilarCandidates 그대로 사용).
 */
export async function findSimilarCandidatesWithBody(
  admin: SupabaseClient,
  publishedAt: string | null | undefined,
  sinceDays = 7,
  limit = 300
): Promise<SimilarityCandidateWithBody[]> {
  const baseMs = publishedAt ? new Date(publishedAt).getTime() : Date.now()
  if (isNaN(baseMs)) return []
  const sinceIso = new Date(baseMs - sinceDays * 24 * 60 * 60 * 1000).toISOString()

  const { data, error } = await admin
    .from('contents')
    .select('id, title, published_at, collected_at, cluster_id, body_original, source_id, importance_score, thumbnail_url, sources(trust_tier)')
    .eq('category', '뉴스')
    .gte('collected_at', sinceIso)
    .order('collected_at', { ascending: false })
    .limit(limit)

  if (error) {
    console.error('[크롤러] 유사 후보(본문 포함) 조회 오류:', error.message)
    return []
  }

  return ((data ?? []) as unknown[]).map((row) => {
    const r = row as {
      id: string; title: string; published_at: string | null; collected_at: string
      cluster_id: string | null; body_original: string | null; source_id: string | null
      importance_score: number | null; thumbnail_url: string | null
      sources: { trust_tier: number | null } | { trust_tier: number | null }[] | null
    }
    const src = Array.isArray(r.sources) ? r.sources[0] : r.sources
    return {
      id: r.id,
      title: r.title,
      published_at: r.published_at,
      collected_at: r.collected_at,
      cluster_id: r.cluster_id,
      body_original: r.body_original,
      source_id: r.source_id,
      importance_score: r.importance_score,
      thumbnail_url: r.thumbnail_url,
      trust_tier: src?.trust_tier ?? null,
    }
  })
}
