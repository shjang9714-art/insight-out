import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'

const ENTITY_LIMIT = 5000
const ALIAS_LIMIT = 5000

/** lower(name) → entity_id. canonical_name 과 entity_aliases 를 합친다. */
export async function loadEntityAliasMap(admin: SupabaseClient): Promise<Map<string, string>> {
  try {
    const [entityResult, aliasResult] = await Promise.all([
      admin.from('entities').select('id, canonical_name').limit(ENTITY_LIMIT),
      admin.from('entity_aliases').select('alias, entity_id').limit(ALIAS_LIMIT),
    ])

    if (entityResult.error || aliasResult.error) {
      const reasons = [entityResult.error?.message, aliasResult.error?.message]
        .filter((message): message is string => Boolean(message))
        .join('; ')
      console.warn('[엔티티] 대표 이름·별칭 조회 실패, 링킹 skip:', reasons)
      return new Map()
    }

    const aliasMap = new Map<string, string>()
    for (const row of (entityResult.data ?? []) as { id: string; canonical_name: string }[]) {
      aliasMap.set(row.canonical_name.toLowerCase(), row.id)
    }
    // 사람이 명시한 별칭을 나중에 넣어 대표 이름 충돌 시 우선한다.
    for (const row of (aliasResult.data ?? []) as { alias: string; entity_id: string }[]) {
      aliasMap.set(row.alias.toLowerCase(), row.entity_id)
    }
    return aliasMap
  } catch (error) {
    console.warn('[엔티티] 대표 이름·별칭 로드 실패, 링킹 skip:', error)
    return new Map()
  }
}
