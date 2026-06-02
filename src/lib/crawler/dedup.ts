import type { SupabaseClient } from '@supabase/supabase-js'

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
