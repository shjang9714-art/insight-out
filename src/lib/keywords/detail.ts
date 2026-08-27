import 'server-only'

import { cache } from 'react'
import type { EntityType } from '@/lib/types'
import { createClient } from '@/lib/supabase/server'
import { tagTypeToBucket, type TagBucket } from '@/lib/tag-buckets'

const DAY_MS = 86_400_000
const KST_OFFSET_MS = 9 * 60 * 60 * 1000
const DEFAULT_DAYS = 30
const MAX_DAYS = 90
/** PostgREST max-rows. 이 이상 요청해도 서버가 조용히 자른다.
 * 이 행들은 기사 목록 표시 전용이다 — 지표는 587-A RPC가 DB에서 계산한다. */
const ARTICLE_ROWS = 1_000

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
}

export interface KeywordRelated {
  bucket: TagBucket
  entity: KeywordEntityMatch | null
  keywords: RelatedKeyword[]
  entities: RelatedEntity[]
  /** 연관 엔티티 중 company 유형의 전체 수. 목록(entities)은 상위 p_limit개뿐이다. */
  companyCount: number
  articles: KeywordArticle[]
  events: KeywordEvent[]
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
}

interface MetricsRow {
  document_count: number
  total_mentions: number
  current_count: number
  previous_count: number
  last_collected_at: string | null
}

interface RelatedEntityRow extends EntityRow {
  content_count: number
  total_count: number
  company_count: number
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
    .limit(ARTICLE_ROWS)

  if (error) {
    console.error('[키워드 상세] 콘텐츠 조회 오류:', error.message)
    return { rows: [] }
  }

  return { rows: (data ?? []) as unknown as ContentRow[] }
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
  const [{ rows }, entity, matchName, supabase] = await Promise.all([
    loadKeywordContents(name, DEFAULT_DAYS),
    resolveKeywordEntity(name),
    resolveMatchName(name),
    createClient(),
  ])

  const [entitiesRes, keywordGroupsRes, eventsRes] = await Promise.all([
    supabase.rpc('keyword_related_entities', {
      p_match_name: matchName,
      p_days: DEFAULT_DAYS,
      p_exclude_entity_id: entity?.id ?? null,
      p_limit: 12,
    }),
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

  if (entitiesRes.error) {
    console.error('[키워드 상세] 연관 엔티티 조회 오류:', entitiesRes.error.message)
  }
  const relatedEntityRows = (entitiesRes.data ?? []) as RelatedEntityRow[]
  const entities = relatedEntityRows.map((row) => ({
    id: row.id,
    name: row.canonical_name,
    type: row.entity_type,
    isCompetitor: row.is_competitor,
    count: row.content_count,
  }))

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
    companyCount: relatedEntityRows[0]?.company_count ?? 0,
    articles,
    events,
  }
})

export async function getKeywordDailyCounts(
  name: string,
  days = DEFAULT_DAYS,
): Promise<KeywordDailyCount[]> {
  const safeDays = clampDays(days)
  const [matchName, supabase] = await Promise.all([resolveMatchName(name), createClient()])
  const { data, error } = await supabase.rpc('keyword_daily_counts', {
    p_match_name: matchName,
    p_days: safeDays,
  })
  if (error) {
    console.error('[키워드 상세] 일별 집계 조회 오류:', error.message)
  }
  const counts = new Map<string, number>()
  for (const row of (data ?? []) as { day: string; cnt: number }[]) {
    counts.set(row.day, row.cnt)
  }

  // RPC는 값이 0인 날을 돌려주지 않는다. 축은 앱이 만든다(기존과 동일).
  return Array.from({ length: safeDays }, (_, index) => {
    const date = getKstDateKey(getKstDayStart(safeDays - 1 - index))
    return { date, count: counts.get(date) ?? 0 }
  })
}

export async function getKeywordSnapshot(name: string): Promise<KeywordSnapshot> {
  const [matchName, supabase, related] = await Promise.all([
    resolveMatchName(name),
    createClient(),
    loadKeywordRelations(name),
  ])
  const { data, error } = await supabase.rpc('keyword_metrics', {
    p_match_name: matchName,
    p_days: DEFAULT_DAYS,
  })
  if (error) {
    console.error('[키워드 상세] 핵심 지표 조회 오류:', error.message)
  }
  const metrics = ((data ?? []) as MetricsRow[])[0] ?? null
  const currentCount = metrics?.current_count ?? 0
  const previousCount = metrics?.previous_count ?? 0

  const changePct = previousCount === 0
    ? (currentCount > 0 ? 100 : 0)
    : Math.round(((currentCount - previousCount) / previousCount) * 100)
  const recentDateKey = getKstDateKey(getKstDayStart(6))
  const entityEventCount = related.events.filter(
    (event) => event.event_date >= recentDateKey,
  ).length

  return {
    documentCount: metrics?.document_count ?? 0,
    totalMentions: metrics?.total_mentions ?? 0,
    changePct,
    isNew: previousCount === 0 && currentCount > 0,
    currentCount,
    previousCount,
    relatedCompanyCount: related.companyCount,
    newEventCount: entityEventCount,
    lastUpdatedAt: metrics?.last_collected_at ?? null,
  }
}

export async function getKeywordRelated(name: string): Promise<KeywordRelated> {
  return loadKeywordRelations(name)
}
