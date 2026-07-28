import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { normalizeText, normalizeUrl, sha256 } from '@/lib/crawler/normalize'
import type { DiscoveredItem } from '@/lib/ingestion/types'

const QUERY_BATCH_SIZE = 200

export interface QueueDiscoveredResult {
  fetched: number
  queued: number
  duplicate: number
  discoveries: number
}

function chunks<T>(values: T[], size: number): T[][] {
  const result: T[][] = []
  for (let index = 0; index < values.length; index += size) {
    result.push(values.slice(index, index + size))
  }
  return result
}

function candidateKey(url: string): string {
  return sha256(normalizeUrl(url))
}

export async function queueDiscoveredItems(
  admin: SupabaseClient,
  discoveredItems: DiscoveredItem[],
): Promise<QueueDiscoveredResult> {
  if (discoveredItems.length === 0) {
    return { fetched: 0, queued: 0, duplicate: 0, discoveries: 0 }
  }

  const prepared = discoveredItems
    .filter(({ item }) => item.original_url && item.title)
    .map((discovered) => {
      const canonicalUrl = normalizeUrl(discovered.item.original_url)
      return {
        discovered,
        dedupKey: candidateKey(canonicalUrl),
        canonicalUrl,
      }
    })

  const uniqueCandidates = new Map<string, (typeof prepared)[number]>()
  for (const preparedItem of prepared) {
    if (!uniqueCandidates.has(preparedItem.dedupKey)) {
      uniqueCandidates.set(preparedItem.dedupKey, preparedItem)
    }
  }

  const dedupKeys = [...uniqueCandidates.keys()]
  const existingKeys = new Set<string>()
  for (const batch of chunks(dedupKeys, QUERY_BATCH_SIZE)) {
    const { data, error } = await admin
      .from('article_candidates')
      .select('dedup_key')
      .in('dedup_key', batch)
    if (error) throw new Error(`기사 후보 중복 조회 실패: ${error.message}`)
    for (const row of data ?? []) existingKeys.add(row.dedup_key as string)
  }

  const candidateRows = [...uniqueCandidates.values()].map(({ discovered, dedupKey, canonicalUrl }) => ({
    dedup_key: dedupKey,
    original_url: discovered.item.original_url,
    canonical_url: canonicalUrl,
    normalized_title: normalizeText(discovered.item.title),
    title: discovered.item.title,
    body_snippet: discovered.item.body ?? null,
    author: discovered.item.author ?? null,
    language: discovered.item.language ?? 'ko',
    thumbnail_url: discovered.item.thumbnail_url ?? null,
    published_at: discovered.item.published_at ?? null,
    source_id: discovered.sourceId ?? null,
    source_type: discovered.sourceType ?? 'news_site',
    trust_tier: discovered.trustTier ?? 1,
    first_provider: discovered.provider,
    first_query: discovered.query ?? null,
  }))

  const { error: candidateError } = await admin
    .from('article_candidates')
    .upsert(candidateRows, {
      onConflict: 'dedup_key',
      ignoreDuplicates: true,
    })
  if (candidateError) throw new Error(`기사 후보 저장 실패: ${candidateError.message}`)

  const candidateIds = new Map<string, string>()
  for (const batch of chunks(dedupKeys, QUERY_BATCH_SIZE)) {
    const { data, error } = await admin
      .from('article_candidates')
      .select('id, dedup_key')
      .in('dedup_key', batch)
    if (error) throw new Error(`기사 후보 식별자 조회 실패: ${error.message}`)
    for (const row of data ?? []) {
      candidateIds.set(row.dedup_key as string, row.id as string)
    }
  }

  const discoveryRows = prepared.flatMap(({ discovered, dedupKey, canonicalUrl }) => {
    const candidateId = candidateIds.get(dedupKey)
    if (!candidateId) return []
    const providerItemId = discovered.providerItemId ?? canonicalUrl
    return [{
      candidate_id: candidateId,
      discovery_key: sha256(`${discovered.provider}|${discovered.query ?? ''}|${providerItemId}`),
      provider: discovered.provider,
      provider_item_id: providerItemId,
      source_id: discovered.sourceId ?? null,
      query: discovered.query ?? null,
      raw_metadata: discovered.rawMetadata ?? {},
    }]
  })

  const { error: discoveryError } = await admin
    .from('candidate_discoveries')
    .upsert(discoveryRows, {
      onConflict: 'discovery_key',
      ignoreDuplicates: true,
    })
  if (discoveryError) throw new Error(`기사 발견 출처 저장 실패: ${discoveryError.message}`)

  const queued = dedupKeys.filter((key) => !existingKeys.has(key)).length
  return {
    fetched: prepared.length,
    queued,
    duplicate: prepared.length - queued,
    discoveries: discoveryRows.length,
  }
}
