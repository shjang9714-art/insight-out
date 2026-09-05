import type { SupabaseClient } from '@supabase/supabase-js'
import * as lens from '@/lib/lens'

export type InterestKind = 'entity' | 'topic'

function isDuplicateError(error: { code?: string } | null): boolean {
  return error?.code === '23505'
}

export async function addInterest(
  supabase: SupabaseClient,
  userId: string,
  kind: InterestKind,
  targetId: string,
): Promise<void> {
  const { error } = await supabase.from('user_interests').insert({
    user_id: userId,
    kind,
    entity_id: kind === 'entity' ? targetId : null,
    group_id: kind === 'topic' ? targetId : null,
    weight: 1,
  })
  if (error && !isDuplicateError(error)) throw error

  if (kind === 'entity') {
    // 608 이행기 — user_watchlist 소비처 정리 후 제거
    const { data: entity, error: entityError } = await supabase
      .from('entities')
      .select('canonical_name')
      .eq('id', targetId)
      .single()
    if (entityError || !entity) {
      console.warn('[interests] user_watchlist 이름 조회 실패:', entityError?.message)
    } else {
      const { error: watchlistError } = await supabase.from('user_watchlist').insert({
        user_id: userId,
        company: entity.canonical_name,
        entity_id: targetId,
      })
      if (watchlistError && !isDuplicateError(watchlistError)) {
        console.warn('[interests] user_watchlist 동시 쓰기 실패:', watchlistError.message)
      }
    }
  }

  lens.invalidateLensContext()
}

export async function removeInterest(
  supabase: SupabaseClient,
  userId: string,
  kind: InterestKind,
  targetId: string,
): Promise<void> {
  let query = supabase
    .from('user_interests')
    .delete()
    .eq('user_id', userId)
    .eq('kind', kind)
  query = kind === 'entity'
    ? query.eq('entity_id', targetId)
    : query.eq('group_id', targetId)
  const { error } = await query
  if (error) throw error

  if (kind === 'entity') {
    // 608 이행기 — user_watchlist 소비처 정리 후 제거
    const { error: watchlistError } = await supabase
      .from('user_watchlist')
      .delete()
      .eq('user_id', userId)
      .eq('entity_id', targetId)
    if (watchlistError) {
      console.warn('[interests] user_watchlist 동시 삭제 실패:', watchlistError.message)
    }
  }

  lens.invalidateLensContext()
}
