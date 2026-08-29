import type { SupabaseClient } from '@supabase/supabase-js'

const DEFAULT_EVENTS = 10
const DEFAULT_NEIGHBORS = 8
const DEFAULT_CONTENTS = 10
const MAX_ROWS = 1_000
// KnowledgeGraph.tsx의 관계 노출 기준과 같은 값이다.
const MIN_LIFT = 2.0

export interface EntityBrief {
  entity: {
    id: string
    canonicalName: string
    entityType: string
    description: string | null
    isCompetitor: boolean
  }
  aliases: string[]
  signalSummary: {
    signalCount: number
    contentCount: number
    signalTypes: string[]
    lastSeen: string | null
  } | null
  events: Array<{
    id: string
    eventDate: string
    signalType: string | null
    headline: string
    detail: string | null
    bizImpact: string | null
    bizImpactReason: string | null
    citations: string[]
  }>
  neighbors: Array<{
    entityId: string
    canonicalName: string
    entityType: string
    weight: number
    lift: number
    share: number
  }>
  contents: Array<{
    id: string
    title: string
    collectedAt: string
  }>
  errors: string[]
}

interface EntityRow {
  id: string
  canonical_name: string
  entity_type: string
  description: string | null
  is_competitor: boolean
}

function errorMessage(section: string, error: unknown): string {
  const reason = error instanceof Error ? error.message : String(error)
  return `${section}: ${reason}`
}

function rowLimit(value: number | undefined, fallback: number): number {
  return Math.min(Math.max(value ?? fallback, 1), MAX_ROWS)
}

async function findEntity(
  admin: SupabaseClient,
  target: { id: string } | { name: string },
): Promise<EntityRow | null> {
  const select = 'id, canonical_name, entity_type, description, is_competitor'
  if ('id' in target) {
    const { data, error } = await admin.from('entities').select(select).eq('id', target.id).limit(1).maybeSingle()
    if (error) throw error
    return data as EntityRow | null
  }

  const name = target.name.trim()
  if (!name) return null

  const exact = await admin.from('entities').select(select).eq('canonical_name', name).limit(1).maybeSingle()
  if (exact.error) throw exact.error
  if (exact.data) return exact.data as EntityRow

  const alias = await admin.from('entity_aliases').select('entity_id').eq('alias', name).limit(1).maybeSingle()
  if (alias.error) throw alias.error
  if (alias.data?.entity_id) {
    const matched = await admin.from('entities').select(select).eq('id', alias.data.entity_id).limit(1).maybeSingle()
    if (matched.error) throw matched.error
    if (matched.data) return matched.data as EntityRow
  }

  const partial = await admin.from('entities').select(select).ilike('canonical_name', `%${name}%`).limit(1).maybeSingle()
  if (partial.error) throw partial.error
  return partial.data as EntityRow | null
}

export async function getEntityBrief(
  admin: SupabaseClient,
  target: { id: string } | { name: string },
  opts?: { events?: number; neighbors?: number; contents?: number },
): Promise<EntityBrief | null> {
  const entity = await findEntity(admin, target)
  if (!entity) return null

  const errors: string[] = []
  const eventsLimit = rowLimit(opts?.events, DEFAULT_EVENTS)
  const neighborsLimit = rowLimit(opts?.neighbors, DEFAULT_NEIGHBORS)
  const contentsLimit = rowLimit(opts?.contents, DEFAULT_CONTENTS)

  const [aliasesResult, summaryResult, eventsResult, neighborsResult, contentsResult] = await Promise.all([
    admin.from('entity_aliases').select('alias').eq('entity_id', entity.id).order('alias').limit(MAX_ROWS),
    admin.from('entity_signal_summary').select('signal_count, content_count, signal_types, last_seen').eq('entity_id', entity.id).limit(1).maybeSingle(),
    admin.from('entity_events').select('id, event_date, signal_type, headline, detail, biz_impact, biz_impact_reason, citations').eq('entity_id', entity.id).order('event_date', { ascending: false }).limit(eventsLimit),
    admin.rpc('entity_neighbors_v2', { p_entity_id: entity.id, p_limit: neighborsLimit, p_min_lift: MIN_LIFT }),
    admin.rpc('entity_recent_contents', { p_entity_id: entity.id, p_limit: contentsLimit }),
  ])

  if (aliasesResult.error) errors.push(errorMessage('별칭', aliasesResult.error))
  if (summaryResult.error) errors.push(errorMessage('시그널 요약', summaryResult.error))
  if (eventsResult.error) errors.push(errorMessage('최근 사건', eventsResult.error))
  if (neighborsResult.error) errors.push(errorMessage('관계', neighborsResult.error))
  if (contentsResult.error) errors.push(errorMessage('최근 뉴스', contentsResult.error))

  const neighborRows = neighborsResult.error ? [] : ((neighborsResult.data ?? []) as Array<{
    entity_id: string
    weight: number
    lift: number
    share: number
  }>)
  const neighborIds = neighborRows.map((row) => row.entity_id)
  let neighborEntities: Array<{ id: string; canonical_name: string; entity_type: string }> = []
  if (neighborIds.length > 0) {
    const namesResult = await admin
      .from('entities')
      .select('id, canonical_name, entity_type')
      .in('id', neighborIds)
      .limit(Math.min(neighborIds.length, MAX_ROWS))
    if (namesResult.error) errors.push(errorMessage('관계 이름', namesResult.error))
    else neighborEntities = (namesResult.data ?? []) as typeof neighborEntities
  }
  const neighborEntityMap = new Map(neighborEntities.map((row) => [row.id, row]))

  const summary = summaryResult.error ? null : summaryResult.data as {
    signal_count: number
    content_count: number
    signal_types: string[] | null
    last_seen: string | null
  } | null

  return {
    entity: {
      id: entity.id,
      canonicalName: entity.canonical_name,
      entityType: entity.entity_type,
      description: entity.description,
      isCompetitor: entity.is_competitor,
    },
    aliases: aliasesResult.error
      ? []
      : ((aliasesResult.data ?? []) as Array<{ alias: string }>).map((row) => row.alias),
    signalSummary: summary ? {
      signalCount: summary.signal_count,
      contentCount: summary.content_count,
      signalTypes: summary.signal_types ?? [],
      lastSeen: summary.last_seen,
    } : null,
    events: eventsResult.error ? [] : (eventsResult.data ?? []).map((row) => ({
      id: row.id as string,
      eventDate: row.event_date as string,
      signalType: row.signal_type as string | null,
      headline: row.headline as string,
      detail: row.detail as string | null,
      bizImpact: row.biz_impact as string | null,
      bizImpactReason: row.biz_impact_reason as string | null,
      citations: Array.isArray(row.citations) ? row.citations as string[] : [],
    })),
    neighbors: neighborRows.flatMap((row) => {
      const matched = neighborEntityMap.get(row.entity_id)
      return matched ? [{
        entityId: row.entity_id,
        canonicalName: matched.canonical_name,
        entityType: matched.entity_type,
        weight: row.weight,
        lift: row.lift,
        share: row.share,
      }] : []
    }),
    contents: contentsResult.error ? [] : ((contentsResult.data ?? []) as Array<{
      id: string
      title: string
      collected_at: string
    }>).map((row) => ({
      id: row.id,
      title: row.title,
      collectedAt: row.collected_at,
    })),
    errors,
  }
}
