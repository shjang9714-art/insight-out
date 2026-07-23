import 'server-only'

import { cache } from 'react'
import type { EntityType } from '@/lib/types'
import { createClient } from '@/lib/supabase/server'
import { tagTypeToBucket, type TagBucket } from '@/lib/tag-buckets'

const DAY_MS = 86_400_000
const KST_OFFSET_MS = 9 * 60 * 60 * 1000
const DEFAULT_DAYS = 30
const MAX_DAYS = 90
const MAX_CONTENT_ROWS = 2_000
const QUERY_CHUNK_SIZE = 100

export interface KeywordDailyCount {
  date: string
  count: number
}

export interface KeywordEntityMatch {
  id: string
  name: string
  type: EntityType
  isCompetitor: boolean
}

export interface KeywordArticle {
  id: string
  title: string
  summary: string | null
  category: string | null
  publishedAt: string | null
  collectedAt: string
  sourceName: string | null
}

export interface KeywordEvent {
  id: string
  event_date: string
  signal_type: string | null
  headline: string
  detail: string | null
  biz_impact: 'crisis' | 'opportunity' | 'neutral' | null
  biz_impact_reason: string | null
  citations: string[]
  generatedAt: string | null
}

export interface RelatedKeyword {
  name: string
  count: number
  bucket: TagBucket
}

export interface RelatedEntity {
  id: string
  name: string
  type: EntityType
  isCompetitor: boolean
  count: number
}

export interface KeywordSnapshot {
  documentCount: number
  totalMentions: number
  changePct: number
  isNew: boolean
  currentCount: number
  previousCount: number
  relatedCompanyCount: number
  newEventCount: number
  lastUpdatedAt: string | null
  isTruncated: boolean
}

export interface KeywordRelated {
  bucket: TagBucket
  entity: KeywordEntityMatch | null
  keywords: RelatedKeyword[]
  entities: RelatedEntity[]
  articles: KeywordArticle[]
  events: KeywordEvent[]
  recentIssueCount: number
  isTruncated: boolean
}

interface ContentRow {
  id: string
  title: string
  summary_ko: string | null
  category: string | null
  published_at: string | null
  collected_at: string
  matched_keywords: string[] | null
  sources: { name: string } | { name: string }[] | null
}

interface LoadedContents {
  rows: ContentRow[]
  isTruncated: boolean
}

interface EntityRow {
  id: string
  canonical_name: string
  entity_type: EntityType
  is_competitor: boolean
}

interface EntityEventRow {
  id: string
  event_date: string
  signal_type: string | null
  headline: string
  detail: string | null
  biz_impact: 'crisis' | 'opportunity' | 'neutral' | null
  biz_impact_reason: string | null
  citations: string[] | null
  generated_at: string | null
}

function clampDays(days: number): number {
  if (!Number.isFinite(days)) return DEFAULT_DAYS
  return Math.min(MAX_DAYS, Math.max(1, Math.floor(days)))
}

function getKstDateKey(value: Date | string): string {
  const date = typeof value === 'string' ? new Date(value) : value
  return new Date(date.getTime() + KST_OFFSET_MS).toISOString().slice(0, 10)
}

function getKstDayStart(daysAgo: number): Date {
  const [year, month, day] = getKstDateKey(new Date()).split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day) - KST_OFFSET_MS - daysAgo * DAY_MS)
}

function normalize(value: string): string {
  return value.trim().toLocaleLowerCase('ko-KR')
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, '\\$&')
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size))
  }
  return chunks
}

function entityTypeToBucket(type: EntityType): TagBucket {
  if (type === 'tech' || type === 'product') return '기술·제품'
  if (type === 'company' || type === 'person') return '기업·기관'
  if (type === 'industry') return '시장·산업'
  if (type === 'policy') return '정책·규제'
  return '그 외'
}

function sourceNameOf(source: ContentRow['sources']): string | null {
  if (Array.isArray(source)) return source[0]?.name ?? null
  return source?.name ?? null
}

const loadKeywordContents = cache(async (name: string, days: number): Promise<LoadedContents> => {
  const safeDays = clampDays(days)
  const since = getKstDayStart(safeDays - 1).toISOString()
  const supabase = await createClient()
  const matchName = await resolveMatchName(name)
  const { data, error } = await supabase
    .from('contents')
    .select('id, title, summary_ko, category, published_at, collected_at, matched_keywords, sources(name)')
    .eq('status', 'published')
    .contains('matched_keywords', [matchName])
    .gte('collected_at', since)
    .order('collected_at', { ascending: false })
    .limit(MAX_CONTENT_ROWS + 1)

  if (error) {
    console.error('[키워드 상세] 콘텐츠 조회 오류:', error.message)
    return { rows: [], isTruncated: false }
  }

  const rawRows = (data ?? []) as unknown as ContentRow[]
  const isTruncated = rawRows.length > MAX_CONTENT_ROWS
  if (isTruncated) {
    console.warn(`[키워드 상세] "${name}" 조회가 ${MAX_CONTENT_ROWS.toLocaleString()}건 상한에서 절단됐습니다.`)
  }
  return { rows: rawRows.slice(0, MAX_CONTENT_ROWS), isTruncated }
})

const resolveKeywordEntity = cache(async (name: string): Promise<KeywordEntityMatch | null> => {
  const supabase = await createClient()
  const literalName = escapeLike(name.trim())
  const { data: canonicalData } = await supabase
    .from('entities')
    .select('id, canonical_name, entity_type, is_competitor')
    .ilike('canonical_name', literalName)
    .limit(1)
    .maybeSingle()

  let entity = canonicalData as unknown as EntityRow | null
  if (!entity) {
    const { data: aliasData } = await supabase
      .from('entity_aliases')
      .select('entity_id')
      .ilike('alias', literalName)
      .limit(1)
      .maybeSingle()

    const entityId = (aliasData as { entity_id?: string } | null)?.entity_id
    if (entityId) {
      const { data } = await supabase
        .from('entities')
        .select('id, canonical_name, entity_type, is_competitor')
        .eq('id', entityId)
        .maybeSingle()
      entity = data as unknown as EntityRow | null
    }
  }

  return entity
    ? {
        id: entity.id,
        name: entity.canonical_name,
        type: entity.entity_type,
        isCompetitor: entity.is_competitor,
      }
    : null
})

/**
 * 입력 키워드(`ai`/`AI`/`Ai` 등 임의 표기)를 실제 `contents.matched_keywords`에
 * 저장된 표기(canonical casing)로 해석한다. `.contains`가 배열 정확일치라
 * 대소문자가 다르면 0건이 되는 문제(365)를 여기서 흡수한다.
 * 해석 순서: (a) 엔티티 canonical_name → (b) keywords 테이블 저장표기(대소문자 무시)
 * → (c) 그래도 없으면 입력값 그대로(레거시 minimal RPC 폴백, 미적용 시 조용히 스킵).
 */
const resolveMatchName = cache(async (name: string): Promise<string> => {
  const trimmed = name.trim()
  if (!trimmed) return trimmed

  const entity = await resolveKeywordEntity(trimmed)
  if (entity) return entity.name

  const supabase = await createClient()
  const literalName = escapeLike(trimmed)
  const { data: keywordRow } = await supabase
    .from('keywords')
    .select('name')
    .ilike('name', literalName)
    .limit(1)
    .maybeSingle()
  if (keywordRow && typeof (keywordRow as { name?: unknown }).name === 'string') {
    return (keywordRow as { name: string }).name
  }

  // sql-handoff/365-*.sql 미적용 환경에서는 함수 없음(42883) 오류로 조용히 폴백한다.
  const { data: rpcName, error: rpcError } = await supabase.rpc(
    'resolve_matched_keyword_casing',
    { p_name: trimmed },
  )
  if (!rpcError && typeof rpcName === 'string' && rpcName) return rpcName

  return trimmed
})

const loadKeywordRelations = cache(async (name: string): Promise<KeywordRelated> => {
  const [{ rows, isTruncated }, entity, supabase] = await Promise.all([
    loadKeywordContents(name, DEFAULT_DAYS),
    resolveKeywordEntity(name),
    createClient(),
  ])
  const contentIds = rows.map((row) => row.id)
  const recentSince = getKstDayStart(6)
  const recentContentIds = rows
    .filter((row) => new Date(row.collected_at) >= recentSince)
    .map((row) => row.id)

  const contentChunks = chunk(contentIds, QUERY_CHUNK_SIZE)
  const recentChunks = chunk(recentContentIds, QUERY_CHUNK_SIZE)

  const [entityBatches, issueBatches, keywordGroupsRes, eventsRes] = await Promise.all([
    Promise.all(contentChunks.map((ids) =>
      supabase
        .from('content_entities')
        .select('content_id, entity_id, entities(id, canonical_name, entity_type, is_competitor)')
        .in('content_id', ids)
        .limit(QUERY_CHUNK_SIZE * 10)
    )),
    Promise.all(recentChunks.map((ids) =>
      supabase
        .from('issue_contents')
        .select('issue_id')
        .in('content_id', ids)
        .limit(QUERY_CHUNK_SIZE * 10)
    )),
    supabase
      .from('keyword_groups')
      .select('name, tag_type, include_patterns')
      .eq('is_active', true),
    entity
      ? supabase
          .from('entity_events')
          .select('id, event_date, signal_type, headline, detail, biz_impact, biz_impact_reason, citations, generated_at')
          .eq('entity_id', entity.id)
          .order('event_date', { ascending: false })
          .limit(30)
      : Promise.resolve({ data: [] as unknown[] }),
  ])

  const entityCounts = new Map<string, { row: EntityRow; contentIds: Set<string> }>()
  for (const batch of entityBatches) {
    if (batch.error) {
      console.error('[키워드 상세] 연관 엔티티 조회 오류:', batch.error.message)
      continue
    }
    for (const item of (batch.data ?? []) as unknown as {
      content_id: string
      entity_id: string
      entities: EntityRow | null
    }[]) {
      if (!item.entities || item.entity_id === entity?.id) continue
      const current = entityCounts.get(item.entity_id) ?? {
        row: item.entities,
        contentIds: new Set<string>(),
      }
      current.contentIds.add(item.content_id)
      entityCounts.set(item.entity_id, current)
    }
  }

  const entities = [...entityCounts.values()]
    .map(({ row, contentIds: ids }) => ({
      id: row.id,
      name: row.canonical_name,
      type: row.entity_type,
      isCompetitor: row.is_competitor,
      count: ids.size,
    }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'ko-KR'))

  const tagTypeByPattern = new Map<string, string>()
  for (const group of (keywordGroupsRes.data ?? []) as unknown as {
    name: string
    tag_type: string
    include_patterns: string[] | null
  }[]) {
    for (const pattern of [group.name, ...(group.include_patterns ?? [])]) {
      const key = normalize(pattern)
      if (!tagTypeByPattern.has(key) || tagTypeByPattern.get(key) === 'industry') {
        tagTypeByPattern.set(key, group.tag_type)
      }
    }
  }

  const target = normalize(name)
  const keywordCounts = new Map<string, { name: string; count: number }>()
  for (const row of rows) {
    const seenInDocument = new Set<string>()
    for (const keyword of row.matched_keywords ?? []) {
      const key = normalize(keyword)
      if (!key || key === target || seenInDocument.has(key)) continue
      seenInDocument.add(key)
      const current = keywordCounts.get(key)
      keywordCounts.set(key, {
        name: current?.name ?? keyword,
        count: (current?.count ?? 0) + 1,
      })
    }
  }

  const keywords = [...keywordCounts.entries()]
    .map(([key, value]) => ({
      ...value,
      bucket: tagTypeToBucket(tagTypeByPattern.get(key)),
    }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'ko-KR'))

  const recentIssueIds = new Set<string>()
  for (const batch of issueBatches) {
    if (batch.error) {
      console.error('[키워드 상세] 관련 사건 조회 오류:', batch.error.message)
      continue
    }
    for (const item of (batch.data ?? []) as { issue_id: string }[]) {
      recentIssueIds.add(item.issue_id)
    }
  }

  const events = ((eventsRes.data ?? []) as unknown as EntityEventRow[]).map((event) => ({
    id: event.id,
    event_date: event.event_date,
    signal_type: event.signal_type,
    headline: event.headline,
    detail: event.detail,
    biz_impact: event.biz_impact,
    biz_impact_reason: event.biz_impact_reason,
    citations: Array.isArray(event.citations) ? event.citations : [],
    generatedAt: event.generated_at,
  }))

  const articles = rows.map((row) => ({
    id: row.id,
    title: row.title,
    summary: row.summary_ko,
    category: row.category,
    publishedAt: row.published_at,
    collectedAt: row.collected_at,
    sourceName: sourceNameOf(row.sources),
  }))

  const keywordTagType = tagTypeByPattern.get(target)

  return {
    bucket: keywordTagType
      ? tagTypeToBucket(keywordTagType)
      : (entity ? entityTypeToBucket(entity.type) : '그 외'),
    entity,
    keywords,
    entities,
    articles,
    events,
    recentIssueCount: recentIssueIds.size,
    isTruncated,
  }
})

export async function getKeywordDailyCounts(
  name: string,
  days = DEFAULT_DAYS,
): Promise<KeywordDailyCount[]> {
  const safeDays = clampDays(days)
  const { rows } = await loadKeywordContents(name, safeDays)
  const counts = new Map<string, number>()
  for (const row of rows) {
    const key = getKstDateKey(row.collected_at)
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }

  return Array.from({ length: safeDays }, (_, index) => {
    const date = getKstDateKey(getKstDayStart(safeDays - 1 - index))
    return { date, count: counts.get(date) ?? 0 }
  })
}

export async function getKeywordSnapshot(name: string): Promise<KeywordSnapshot> {
  const [{ rows, isTruncated }, related] = await Promise.all([
    loadKeywordContents(name, DEFAULT_DAYS),
    loadKeywordRelations(name),
  ])
  const currentSince = getKstDayStart(6)
  const previousSince = getKstDayStart(13)
  let currentCount = 0
  let previousCount = 0
  let totalMentions = 0
  const target = normalize(name)

  for (const row of rows) {
    const collectedAt = new Date(row.collected_at)
    if (collectedAt >= currentSince) currentCount += 1
    else if (collectedAt >= previousSince) previousCount += 1

    totalMentions += (row.matched_keywords ?? []).filter(
      (keyword) => normalize(keyword) === target,
    ).length
  }

  const changePct = previousCount === 0
    ? (currentCount > 0 ? 100 : 0)
    : Math.round(((currentCount - previousCount) / previousCount) * 100)
  const recentDateKey = getKstDateKey(currentSince)
  const entityEventCount = related.events.filter(
    (event) => event.event_date >= recentDateKey,
  ).length

  return {
    documentCount: rows.length,
    totalMentions: totalMentions || rows.length,
    changePct,
    isNew: previousCount === 0 && currentCount > 0,
    currentCount,
    previousCount,
    relatedCompanyCount: related.entities.filter((item) => item.type === 'company').length,
    newEventCount: entityEventCount || related.recentIssueCount,
    lastUpdatedAt: rows[0]?.collected_at ?? null,
    isTruncated,
  }
}

export async function getKeywordRelated(name: string): Promise<KeywordRelated> {
  return loadKeywordRelations(name)
}
