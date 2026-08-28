import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'

const ENTITY_LIMIT = 1000 // PostgREST max-rows. 이 이상 요청해도 서버가 조용히 자른다 — 넘길 일이 생기면 range() 페이지네이션이 필요하다
const ALIAS_LIMIT = 1000 // PostgREST max-rows. 이 이상 요청해도 서버가 조용히 자른다 — 넘길 일이 생기면 range() 페이지네이션이 필요하다

export interface EntityAliasIndex {
  map: Map<string, string>
  names: string[]
}

/** lower(name) → entity_id 맵과 대상 필터용 원본 이름을 한 번의 조회로 구성한다. */
export async function loadEntityAliasIndex(admin: SupabaseClient): Promise<EntityAliasIndex> {
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
      return { map: new Map(), names: [] }
    }

    const aliasMap = new Map<string, string>()
    const names = new Set<string>()
    for (const row of (entityResult.data ?? []) as { id: string; canonical_name: string }[]) {
      aliasMap.set(row.canonical_name.toLowerCase(), row.id)
      names.add(row.canonical_name)
    }
    // 사람이 명시한 별칭을 나중에 넣어 대표 이름 충돌 시 우선한다.
    for (const row of (aliasResult.data ?? []) as { alias: string; entity_id: string }[]) {
      aliasMap.set(row.alias.toLowerCase(), row.entity_id)
      names.add(row.alias)
    }
    return { map: aliasMap, names: [...names] }
  } catch (error) {
    console.warn('[엔티티] 대표 이름·별칭 로드 실패, 링킹 skip:', error)
    return { map: new Map(), names: [] }
  }
}

/** lower(name) → entity_id. canonical_name 과 entity_aliases 를 합친다. */
export async function loadEntityAliasMap(admin: SupabaseClient): Promise<Map<string, string>> {
  return (await loadEntityAliasIndex(admin)).map
}
