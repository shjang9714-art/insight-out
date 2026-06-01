import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * 제목 해시 완전일치 중복 확인.
 * hash가 null이면 false 반환 (중복 판정 불가).
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
    .maybeSingle()

  return data !== null
}

/**
 * 본문 해시 완전일치 중복 확인.
 * hash가 null이면 false 반환 (중복 판정 불가).
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
    .maybeSingle()

  return data !== null
}
