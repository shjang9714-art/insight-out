import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { fetchInChunks } from '@/lib/supabase/chunked'
import type { EntityType } from '@/lib/types'

export interface EntityBrief {
  id: string
  name: string
  type: EntityType
  isCompetitor: boolean
  mentionCount: number
}

export interface ConnectedEntity {
  entity: EntityBrief
  sharedCount: number
}

export interface EvidenceContent {
  id: string
  title: string
  category: string | null
  published_at: string | null
}

const CONTENT_SAMPLE_LIMIT = 500
const CONNECTED_LIMIT = 20
const EVIDENCE_LIMIT = 20

const ENTITY_BRIEF_COLUMNS = 'id, canonical_name, entity_type, is_competitor, mention_count'

type EntityBriefRow = {
  id: string
  canonical_name: string
  entity_type: EntityType
  is_competitor: boolean | null
  mention_count: number | null
}

function toEntityBrief(row: EntityBriefRow): EntityBrief {
  return {
    id: row.id,
    name: row.canonical_name,
    type: row.entity_type,
    isCompetitor: row.is_competitor ?? false,
    mentionCount: row.mention_count ?? 0,
  }
}

export async function listEntities(
  admin: SupabaseClient,
  opts: { q?: string; type?: EntityType | null; competitorOnly?: boolean; limit?: number } = {}
): Promise<EntityBrief[]> {
  const limit = Math.min(opts.limit ?? 30, 50)
  let query = admin
    .from('entities')
    .select(ENTITY_BRIEF_COLUMNS)
    .order('mention_count', { ascending: false })
    .limit(limit)

  if (opts.q) query = query.ilike('canonical_name', `%${opts.q}%`)
  if (opts.type) query = query.eq('entity_type', opts.type)
  if (opts.competitorOnly) query = query.eq('is_competitor', true)

  const { data, error } = await query
  if (error) return []
  return ((data ?? []) as EntityBriefRow[]).map(toEntityBrief)
}

export async function getEntityRelations(
  admin: SupabaseClient,
  entityId: string
): Promise<{ focus: EntityBrief | null; connected: ConnectedEntity[]; contentSampled: number; truncated: boolean }> {
  const { data: focusRow, error: focusError } = await admin
    .from('entities')
    .select(ENTITY_BRIEF_COLUMNS)
    .eq('id', entityId)
    .single()

  if (focusError || !focusRow) {
    return { focus: null, connected: [], contentSampled: 0, truncated: false }
  }
  const focus = toEntityBrief(focusRow as EntityBriefRow)

  const { data: contentRows, error: contentError } = await admin
    .from('content_entities')
    .select('content_id')
    .eq('entity_id', entityId)
    .order('created_at', { ascending: false })
    .limit(CONTENT_SAMPLE_LIMIT)

  if (contentError || !contentRows?.length) {
    return { focus, connected: [], contentSampled: 0, truncated: false }
  }
  const contentIds = (contentRows as { content_id: string }[]).map(r => r.content_id)
  const truncated = contentIds.length >= CONTENT_SAMPLE_LIMIT

  const { rows: coRows, error: coError } = await fetchInChunks(contentIds, (chunk) =>
    admin
      .from('content_entities')
      .select('entity_id, content_id')
      .in('content_id', chunk)
      .neq('entity_id', entityId)
  )

  if (coError || !coRows.length) {
    return { focus, connected: [], contentSampled: contentIds.length, truncated }
  }

  const sharedByEntity = new Map<string, Set<string>>()
  for (const row of coRows as { entity_id: string; content_id: string }[]) {
    const set = sharedByEntity.get(row.entity_id) ?? new Set<string>()
    set.add(row.content_id)
    sharedByEntity.set(row.entity_id, set)
  }

  const topIds = [...sharedByEntity.entries()]
    .sort((a, b) => b[1].size - a[1].size)
    .slice(0, CONNECTED_LIMIT)
    .map(([id]) => id)

  if (!topIds.length) {
    return { focus, connected: [], contentSampled: contentIds.length, truncated }
  }

  const { data: entityRows, error: entityError } = await admin
    .from('entities')
    .select(ENTITY_BRIEF_COLUMNS)
    .in('id', topIds)

  if (entityError || !entityRows?.length) {
    return { focus, connected: [], contentSampled: contentIds.length, truncated }
  }

  const briefById = new Map((entityRows as EntityBriefRow[]).map(row => [row.id, toEntityBrief(row)]))
  const connected: ConnectedEntity[] = topIds
    .map(id => {
      const entity = briefById.get(id)
      const sharedCount = sharedByEntity.get(id)?.size ?? 0
      return entity ? { entity, sharedCount } : null
    })
    .filter((v): v is ConnectedEntity => v !== null)
    .sort((a, b) => b.sharedCount - a.sharedCount)

  return { focus, connected, contentSampled: contentIds.length, truncated }
}

export async function getRelationEvidence(admin: SupabaseClient, aId: string, bId: string): Promise<EvidenceContent[]> {
  const { data, error } = await admin.rpc('entity_pair_evidence', {
    p_a: aId,
    p_b: bId,
    p_limit: EVIDENCE_LIMIT,
  })

  if (error) {
    console.error('관계 근거 조회에 실패했습니다.', error)
    return []
  }
  return (data ?? []) as EvidenceContent[]
}
