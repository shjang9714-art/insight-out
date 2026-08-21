import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { EnrichJobResult } from '@/lib/admin/enrich-jobs'
import { loadEntityAliasIndex } from '@/lib/entities/alias-map'

interface EntityRelinkRow {
  id: string
  matched_keywords: string[]
}

export type EntityRelinkResult = EnrichJobResult & {
  batchCapped: boolean
  error?: string
}

function applyTargetFilters<T extends {
  overlaps(column: string, values: string[]): T
  gte(column: string, value: string): T
  lte(column: string, value: string): T
}>(query: T, names: string[], from?: string | null, to?: string | null): T {
  let filtered = query.overlaps('matched_keywords', names)
  if (from) filtered = filtered.gte('collected_at', from)
  if (to) filtered = filtered.lte('collected_at', `${to}T23:59:59.999Z`)
  return filtered
}

async function countRemaining(
  admin: SupabaseClient,
  names: string[],
  from?: string | null,
  to?: string | null,
): Promise<number> {
  let query = admin
    .from('contents')
    .select('id, content_entities()', { count: 'exact', head: true })
    .is('deleted_at', null)
    .not('matched_keywords', 'eq', '{}')
    .is('content_entities', null)
  query = applyTargetFilters(query, names, from, to)

  const { count, error } = await query
  if (error) throw new Error(`남은 엔티티 재연결 대상 집계 실패: ${error.message}`)
  return count ?? 0
}

/** matched_keywords가 있지만 엔티티 링크가 없는 콘텐츠를 규칙 기반으로 다시 연결한다. */
export async function drainEntityRelink(
  admin: SupabaseClient,
  opts: { limit: number; from?: string | null; to?: string | null },
): Promise<EntityRelinkResult> {
  const { map: aliasMap, names } = await loadEntityAliasIndex(admin)
  if (aliasMap.size === 0 || names.length === 0) {
    return {
      processed: 0,
      succeeded: 0,
      skipped: 0,
      remaining: null,
      ready: false,
      batchCapped: false,
      error: '엔티티 대표 이름·별칭 맵이 비어 있어 재연결을 중단했습니다.',
    }
  }

  let targetQuery = admin
    .from('contents')
    .select('id, matched_keywords, content_entities()')
    .is('deleted_at', null)
    .not('matched_keywords', 'eq', '{}')
    .is('content_entities', null)
  targetQuery = applyTargetFilters(targetQuery, names, opts.from, opts.to)

  const { data, error } = await targetQuery
    .order('collected_at', { ascending: true })
    .limit(opts.limit)
  if (error) throw new Error(`엔티티 재연결 대상 조회 실패: ${error.message}`)

  const targets = (data ?? []) as EntityRelinkRow[]
  const ids = targets.map((row) => row.id)
  const linkedIds = new Set<string>()

  if (ids.length > 0) {
    const { data: existingLinks, error: linksError } = await admin
      .from('content_entities')
      .select('content_id')
      .in('content_id', ids)
    if (linksError) throw new Error(`기존 엔티티 링크 조회 실패: ${linksError.message}`)
    for (const row of (existingLinks ?? []) as { content_id: string }[]) linkedIds.add(row.content_id)
  }

  let succeeded = 0
  let alreadyLinked = 0
  let noEntityMatch = 0

  for (const target of targets) {
    if (linkedIds.has(target.id)) {
      alreadyLinked++
      continue
    }

    const entityIds = [...new Set(
      target.matched_keywords
        .map((keyword) => aliasMap.get(keyword.toLowerCase()))
        .filter((entityId): entityId is string => entityId !== undefined),
    )]
    if (entityIds.length === 0) {
      noEntityMatch++
      continue
    }

    const { error: upsertError } = await admin.from('content_entities').upsert(
      entityIds.map((entityId) => ({
        content_id: target.id,
        entity_id: entityId,
        source: 'rule',
        score: 1.0,
      })),
      { onConflict: 'content_id,entity_id', ignoreDuplicates: true },
    )
    if (upsertError) {
      throw new Error(`엔티티 링크 저장 실패(content_id=${target.id}): ${upsertError.message}`)
    }
    succeeded++
  }

  const processed = targets.length
  const skipped = alreadyLinked + noEntityMatch
  return {
    processed,
    succeeded,
    skipped,
    remaining: await countRemaining(admin, names, opts.from, opts.to),
    ready: true,
    batchCapped: processed >= opts.limit,
    extra: { alreadyLinked, noEntityMatch },
  }
}
