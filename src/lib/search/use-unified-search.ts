'use client'

import { useEffect, useState, startTransition } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/client'
import { type ContentCategory } from '@/lib/types'
import { normalizeCompany } from '@/lib/search/company-alias'
import {
  SEARCH_FILTER_DEFS,
  SEARCH_SECTION_ORDER,
  SEARCH_SECTION_DISPLAY_CAP,
  searchFilterDef,
  type SearchFilterKey,
} from '@/lib/search/search-filters'

export interface ContentSearchRow {
  id: string
  title: string
  summary_ko: string | null
  body_original: string | null
  category: ContentCategory
  published_at: string | null
  file_path: string | null
  original_url: string | null
  is_editor_pick: boolean
  author: string | null
  sources: { name: string } | null
  content_keywords: { keywords: { name: string } | null }[]
}

export interface DailyInsightRow {
  id: string
  headline: string
  summary_ko: string | null
  day_of: string
}

export interface IssueRow {
  id: string
  title: string
  summary: string | null
  created_at: string
}

/** 연결된(published) 콘텐츠가 1건 이상 있는 것만 결과에 남는다 — linkedCount/latestPublishedAt 로 카드에 실신호 표시 */
export interface EntityRow {
  id: string
  canonical_name: string
  description: string | null
  linkedCount: number
  latestPublishedAt: string
}

export interface KeywordRow {
  name: string
  linkedCount: number
  latestPublishedAt: string
}

export interface UnifiedResult {
  key: string
  source: 'content' | 'daily_insights' | 'issues' | 'entities' | 'keywords'
  sortDate: string
  content?: ContentSearchRow
  insight?: DailyInsightRow
  issue?: IssueRow
  entity?: EntityRow
  keyword?: KeywordRow
}

export interface SearchSection {
  key: SearchFilterKey
  items: UnifiedResult[]
}

// 소스별 조회 상한 — 기존과 동일(무회귀), 단일 카테고리 필터 선택 시 화면 표시 상한도 동일하게 사용
const FETCH_LIMIT = 60
// 다중 단어 검색 시 토큰 상한 — 과도한 .or() 체이닝 방지
const MAX_QUERY_TOKENS = 5
// 엔티티/키워드 ↔ 콘텐츠 연결 조회 시 안전판(다건 연결된 항목이 과도한 로우를 끌어오지 않게) — 최신순 정렬 후 자르므로
// linkedCount 는 이 상한 내에서의 "적어도" 값이 될 수 있음(카드엔 참고 신호로만 사용, 정밀 집계 목적 아님)
const LINK_FETCH_CAP = 500
const EPOCH = '1970-01-01T00:00:00.000Z'

function sortDesc(items: UnifiedResult[]): UnifiedResult[] {
  return [...items].sort((a, b) => b.sortDate.localeCompare(a.sortDate))
}

/**
 * 검색어를 공백 기준 토큰으로 쪼갠다. 다중 단어(예: "엔비디아 네이버")를 하나의 ilike 패턴
 * `%엔비디아 네이버%` 로 통째로 매칭하면 그 문자열이 그대로 붙어 등장하는 기사만 걸려 0건이
 * 되는 과거 버그가 있었다 — 반드시 토큰 단위로 AND 매칭해야 한다.
 * 회사 별칭 정규화(normalizeCompany)도 토큰 단위로 적용해야 다중 단어에서도 동작한다.
 */
function tokenizeQuery(q: string): string[] {
  return q.split(/\s+/).filter(Boolean).slice(0, MAX_QUERY_TOKENS)
}

/** 토큰 하나의 두 검색 형태 — ilike(제목·요약 등 trigram 인덱스 컬럼용)와
 *  fts(contents.search_vector 전용, to_tsquery('simple') 접두 질의). */
interface QueryToken {
  ilike: string
  /** 한글·영숫자 외 문자를 제거하고 접두(:*)를 붙인 to_tsquery 항. 남는 글자가 없으면 null —
   *  그 토큰은 fts 조건 자체를 건너뛴다(빈 tsquery 로 쿼리를 보내지 않기 위함). */
  fts: string | null
}

// 509 2단계 — 'simple' 설정은 형태소 분석을 하지 않아 '엔비디아의'가 통째로 한 토큰이 된다.
// 접두 매칭(:*)이 없으면 조사 붙은 표기를 전부 놓친다(실측: '엔비디아' 완전일치 false / '엔비디아:*' true).
function buildQueryTokens(q: string): QueryToken[] {
  return tokenizeQuery(q).map((token) => {
    const searchTerm = normalizeCompany(token) ?? token
    const escaped = searchTerm.replace(/[%_]/g, '\\$&')
    const ftsBase = searchTerm.replace(/[^\p{L}\p{N}]/gu, '')
    return {
      ilike: `%${escaped}%`,
      fts: ftsBase ? `${ftsBase}:*` : null,
    }
  })
}

/** 각 토큰이 columns(ilike) 또는 ftsColumn(fts, 지정된 경우만) 중 하나에라도 등장해야 하는
 *  (OR across columns) AND (across tokens) 필터를 체이닝한다. */
function applyTokenFilters<T extends { or: (filter: string) => T }>(
  query: T,
  columns: string[],
  tokens: QueryToken[],
  ftsColumn?: string,
): T {
  let result = query
  for (const token of tokens) {
    const parts = columns.map((col) => `${col}.ilike.${token.ilike}`)
    if (ftsColumn && token.fts) parts.push(`${ftsColumn}.fts(simple).${token.fts}`)
    result = result.or(parts.join(','))
  }
  // 509 2단계 검증용 — fts 조건이 실제로 쿼리에 실리는지 개발 모드에서만 확인
  if (ftsColumn && process.env.NODE_ENV !== 'production') {
    console.debug('[search] fts 토큰:', tokens.map((t) => t.fts))
  }
  return result
}

async function fetchContentCategory(
  supabase: SupabaseClient,
  tokens: QueryToken[],
  categories: ContentCategory[] | undefined,
  cap: number,
): Promise<UnifiedResult[]> {
  let query = applyTokenFilters(
    supabase.from('contents').select(
      'id, title, summary_ko, body_original, category, published_at, file_path, original_url, is_editor_pick, author, sources(name), content_keywords(keywords(name))'
    ),
    // 509 1단계 — body_original 에는 pg_trgm 인덱스가 없어 OR 로 묶이는 순간 인덱스 경로가
    // 버려지고 전량 스캔이 된다(운영 실측 8,166ms, authenticated statement_timeout 8,000ms
    // 초과 → 57014 상시 실패). title/summary_ko 만 ilike 대상으로 한다. .select() 의
    // body_original 은 그대로 둔다 — ContentRow 가 요약 폴백으로 쓴다.
    // 509 2단계 — search_vector(제목+요약+번역본문+원문본문, GIN 인덱스)로 본문 커버리지를
    // 되살린다. ilike 는 그대로 두고 fts 를 OR 로 추가만 한다(교체 아님).
    ['title', 'summary_ko'],
    tokens,
    'search_vector',
  ).eq('status', 'published')
  if (categories) query = query.in('category', categories)
  const { data, error: err } = await query.order('published_at', { ascending: false, nullsFirst: false }).limit(Math.max(cap, FETCH_LIMIT))
  if (err) { console.error('[search] contents 조회 오류:', err); throw err }
  return ((data ?? []) as unknown as ContentSearchRow[])
    .map(row => ({ key: `content-${row.id}`, source: 'content' as const, sortDate: row.published_at ?? EPOCH, content: row }))
    .slice(0, cap)
}

async function fetchInsights(supabase: SupabaseClient, tokens: QueryToken[], cap: number): Promise<UnifiedResult[]> {
  const query = applyTokenFilters(
    supabase.from('daily_insights').select('id, headline, summary_ko, day_of'),
    ['headline', 'summary_ko', 'market_trend', 'competitor_trend', 'implication'],
    tokens,
  ).eq('status', 'published')
  const { data, error: err } = await query.order('day_of', { ascending: false }).limit(Math.max(cap, FETCH_LIMIT))
  if (err) { console.error('[search] daily_insights 조회 오류:', err); throw err }
  return ((data ?? []) as DailyInsightRow[])
    .map(row => ({ key: `insight-${row.id}`, source: 'daily_insights' as const, sortDate: new Date(row.day_of).toISOString(), insight: row }))
    .slice(0, cap)
}

async function fetchIssues(supabase: SupabaseClient, tokens: QueryToken[], cap: number): Promise<UnifiedResult[]> {
  const query = applyTokenFilters(
    supabase.from('issues').select('id, title, summary, created_at'),
    ['title', 'summary'],
    tokens,
  ).eq('status', 'published')
  const { data, error: err } = await query.order('created_at', { ascending: false }).limit(Math.max(cap, FETCH_LIMIT))
  if (err) { console.error('[search] issues 조회 오류:', err); throw err }
  return ((data ?? []) as IssueRow[])
    .map(row => ({ key: `issue-${row.id}`, source: 'issues' as const, sortDate: row.created_at, issue: row }))
    .slice(0, cap)
}

/** entity_id/keyword_id 별 연결된 published 콘텐츠 count·최신 발행일 집계 */
function aggregateLinks(rows: { linkId: string; publishedAt: string | null }[]): Map<string, { count: number; latest: string }> {
  const stats = new Map<string, { count: number; latest: string }>()
  for (const row of rows) {
    if (!row.publishedAt) continue
    const cur = stats.get(row.linkId)
    stats.set(row.linkId, {
      count: (cur?.count ?? 0) + 1,
      latest: cur && cur.latest > row.publishedAt ? cur.latest : row.publishedAt,
    })
  }
  return stats
}

async function fetchEntities(supabase: SupabaseClient, tokens: QueryToken[], cap: number): Promise<UnifiedResult[]> {
  const { data: matched, error: err } = await applyTokenFilters(
    supabase.from('entities').select('id, canonical_name, description'),
    ['canonical_name', 'description'],
    tokens,
  ).limit(FETCH_LIMIT)
  if (err) { console.error('[search] entities 조회 오류:', err); throw err }
  const ids = (matched ?? []).map((e) => e.id as string)
  if (ids.length === 0) return []

  const { data: links, error: linkErr } = await supabase
    .from('content_entities')
    .select('entity_id, contents!inner(published_at)')
    .in('entity_id', ids)
    .eq('contents.status', 'published')
    .order('contents(published_at)', { ascending: false })
    .limit(LINK_FETCH_CAP)
  if (linkErr) { console.error('[search] content_entities 조회 오류:', linkErr); throw linkErr }

  const stats = aggregateLinks(
    ((links ?? []) as unknown as { entity_id: string; contents: { published_at: string | null } }[])
      .map((r) => ({ linkId: r.entity_id, publishedAt: r.contents?.published_at ?? null }))
  )

  const items = (matched ?? [])
    .map((e): UnifiedResult | null => {
      const s = stats.get(e.id as string)
      if (!s) return null // 연결된 published 콘텐츠 0건 — 빈 카드이므로 제외
      const entity: EntityRow = { id: e.id, canonical_name: e.canonical_name, description: e.description, linkedCount: s.count, latestPublishedAt: s.latest }
      return { key: `entity-${e.id}`, source: 'entities', sortDate: s.latest, entity }
    })
    .filter((r): r is UnifiedResult => r !== null)

  return sortDesc(items).slice(0, cap)
}

async function fetchKeywords(supabase: SupabaseClient, tokens: QueryToken[], cap: number): Promise<UnifiedResult[]> {
  const { data: matched, error: err } = await applyTokenFilters(
    supabase.from('keywords').select('id, name'),
    ['name'],
    tokens,
  ).limit(FETCH_LIMIT)
  if (err) { console.error('[search] keywords 조회 오류:', err); throw err }
  const ids = (matched ?? []).map((k) => k.id as string)
  if (ids.length === 0) return []

  const { data: links, error: linkErr } = await supabase
    .from('content_keywords')
    .select('keyword_id, contents!inner(published_at)')
    .in('keyword_id', ids)
    .eq('contents.status', 'published')
    .order('contents(published_at)', { ascending: false })
    .limit(LINK_FETCH_CAP)
  if (linkErr) { console.error('[search] content_keywords 조회 오류:', linkErr); throw linkErr }

  const stats = aggregateLinks(
    ((links ?? []) as unknown as { keyword_id: string; contents: { published_at: string | null } }[])
      .map((r) => ({ linkId: r.keyword_id, publishedAt: r.contents?.published_at ?? null }))
  )

  const items = (matched ?? [])
    .map((k): UnifiedResult | null => {
      const s = stats.get(k.id as string)
      if (!s) return null // 연결된 published 콘텐츠 0건 — 빈 카드이므로 제외
      const keyword: KeywordRow = { name: k.name, linkedCount: s.count, latestPublishedAt: s.latest }
      return { key: `keyword-${k.id}`, source: 'keywords', sortDate: s.latest, keyword }
    })
    .filter((r): r is UnifiedResult => r !== null)

  return sortDesc(items).slice(0, cap)
}

async function fetchSection(
  supabase: SupabaseClient,
  key: SearchFilterKey,
  tokens: QueryToken[],
  cap: number,
): Promise<UnifiedResult[]> {
  const def = searchFilterDef(key)
  if (def.source === 'content') return fetchContentCategory(supabase, tokens, def.categories, cap)
  if (def.source === 'daily_insights') return fetchInsights(supabase, tokens, cap)
  if (def.source === 'issues') return fetchIssues(supabase, tokens, cap)
  if (def.source === 'entities') return fetchEntities(supabase, tokens, cap)
  return fetchKeywords(supabase, tokens, cap)
}

export function useUnifiedSearch(
  q: string,
  filter: SearchFilterKey | '',
): { sections: SearchSection[] | null; isLoading: boolean; error: string | null } {
  const [sections, setSections] = useState<SearchSection[] | null>(null)
  const [isLoading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!q) {
      startTransition(() => { setSections(null); setLoading(false); setError(null) })
      return
    }

    let cancelled = false
    startTransition(() => { setLoading(true); setError(null) })

    // 509 — 타건마다 최대 8개 쿼리가 동시 발사되던 것을 300ms 디바운스로 묶는다.
    // q/filter 가 다시 바뀌면 클린업이 이 타이머를 지우므로 실제 요청은 타이핑이
    // 멈춘 뒤 1회만 나간다.
    const timer = setTimeout(() => {
      const fetchResults = async () => {
        const supabase = createClient()
        const tokens = buildQueryTokens(q)

        // 특정 카테고리 선택 시: 그 종류 하나만 조회, 표시 상한도 60(무회귀 — 기존 단독 필터와 동일)
        const keysToFetch = filter ? [filter] : SEARCH_SECTION_ORDER
        const capFor = (key: SearchFilterKey) => (filter ? FETCH_LIMIT : SEARCH_SECTION_DISPLAY_CAP[key])

        // 509 — 소스별 fetch 함수가 이제 실패 시 throw 하므로 Promise.all 대신
        // allSettled 로 받는다. 한 소스(예: 타임아웃)가 실패해도 나머지 fulfilled
        // 섹션은 그대로 렌더해야 한다 — 전체를 지우면 안 됨.
        const settled = await Promise.allSettled(
          keysToFetch.map(async (key): Promise<SearchSection> => ({
            key,
            items: await fetchSection(supabase, key, tokens, capFor(key)),
          }))
        )

        if (!cancelled) {
          const fulfilled = settled
            .filter((r): r is PromiseFulfilledResult<SearchSection> => r.status === 'fulfilled')
            .map((r) => r.value)
          const rejected = settled.filter((r): r is PromiseRejectedResult => r.status === 'rejected')

          // 매칭 0건 종류는 섹션 자체를 숨김, 고정 순서(SEARCH_SECTION_ORDER) 유지
          const nonEmpty = fulfilled.filter((s) => s.items.length > 0)
          setSections(nonEmpty)

          if (rejected.length > 0) {
            rejected.forEach((r) => console.error('[search] 일부 검색 실패:', r.reason))
            const isTimeout = rejected.some((r) => (r.reason as { code?: string } | null)?.code === '57014')
            setError(
              isTimeout
                ? '검색이 오래 걸려 중단되었습니다. 검색어를 좁혀서 다시 시도해주세요.'
                : '검색 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.'
            )
          } else {
            setError(null)
          }
          setLoading(false)
        }
      }

      fetchResults().catch(errorValue => {
        if (!cancelled) {
          console.error('[search] 검색 중 오류:', errorValue)
          setError('검색 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.')
          setLoading(false)
        }
      })
    }, 300)

    return () => { cancelled = true; clearTimeout(timer) }
  }, [q, filter])

  return { sections, isLoading, error }
}

export { SEARCH_FILTER_DEFS }
