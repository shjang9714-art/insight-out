'use client'

import { useEffect, useRef, useState, startTransition } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/client'
import { fetchInChunks, IN_FILTER_CHUNK_SIZE } from '@/lib/supabase/chunked'
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
  matched_groups: string[] | null
  matched_keywords: string[] | null
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
// 515 — 전체 검색(filter 미지정) 시 콘텐츠 소스(뉴스·유튜브·기술 Blog·AI 리포트·컨설팅
// 리포트·공시자료) 6개 섹션을 category IN(...) 조건 없는 단일 쿼리로 합쳐서 가져온 뒤
// 클라이언트에서 category 로 나눠 배분한다 — 섹션별 표시 상한 합(현재 84) 보다 넉넉하게.
const CONTENT_MERGE_LIMIT = 240
const SEARCH_DEFAULT_SINCE_DAYS: number | null = null
// 다중 단어 검색 시 토큰 상한 — 과도한 .or() 체이닝 방지
const MAX_QUERY_TOKENS = 5
// 엔티티/키워드 ↔ 콘텐츠 연결 조회 시 안전판(다건 연결된 항목이 과도한 로우를 끌어오지 않게) — 최신순 정렬 후 자르므로
// linkedCount 는 이 상한 내에서의 "적어도" 값이 될 수 있음(카드엔 참고 신호로만 사용, 정밀 집계 목적 아님)
const LINK_FETCH_CAP = 500
const EPOCH = '1970-01-01T00:00:00.000Z'
// DB 제한(8초) 밖에서 네트워크가 멈춘 경우의 백스톱이다. 검색 실측 최대는 26초였다.
const SEARCH_ABORT_TIMEOUT_MS = 30_000
const SEARCH_ABORT_TIMEOUT_MESSAGE = '검색이 오래 걸립니다. 검색어를 좁혀서 다시 시도해주세요.'
// 224MB shared_buffers 를 동시 쿼리가 서로 밀어내면 각각이 콜드가 된다.
// 515·515-2 가 기록한 8초 타임아웃의 원인과 같은 부류다. 값은 계측 후 조정한다.
const SEARCH_QUERY_CONCURRENCY = 3

export async function allSettledLimited<T>(
  tasks: (() => Promise<T>)[],
  limit: number,
): Promise<PromiseSettledResult<T>[]> {
  const results = new Array<PromiseSettledResult<T>>(tasks.length)
  const workerCount = Math.min(tasks.length, Math.max(1, Math.floor(limit)))
  let nextIndex = 0

  const worker = async () => {
    while (nextIndex < tasks.length) {
      const index = nextIndex
      nextIndex += 1
      try {
        results[index] = { status: 'fulfilled', value: await tasks[index]() }
      } catch (reason) {
        results[index] = { status: 'rejected', reason }
      }
    }
  }

  await Promise.all(Array.from({ length: workerCount }, () => worker()))
  return results
}

function isAbortError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const candidate = error as { name?: string; message?: string }
  return candidate.name === 'AbortError'
    || candidate.message?.includes('AbortError') === true
    || candidate.message?.includes('operation was aborted') === true
}

function searchFailureDetails(reason: unknown): { code: string; message: string } {
  if (reason !== null && typeof reason === 'object') {
    const candidate = reason as { code?: unknown; message?: unknown }
    return {
      code: typeof candidate.code === 'string' ? candidate.code : '-',
      message: typeof candidate.message === 'string' ? candidate.message : '알 수 없는 오류',
    }
  }
  if (typeof reason === 'string') return { code: '-', message: reason }
  return { code: '-', message: '알 수 없는 오류' }
}

function throwSearchFailure(reason: unknown, searchSource: string): never {
  if (reason !== null && typeof reason === 'object') {
    Object.assign(reason, { searchSource })
    throw reason
  }
  throw { message: typeof reason === 'string' ? reason : '알 수 없는 오류', searchSource }
}

function searchFailureSource(reason: unknown, fallback: string): string {
  if (reason !== null && typeof reason === 'object') {
    const source = (reason as { searchSource?: unknown }).searchSource
    if (typeof source === 'string') return source
  }
  return fallback
}

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
export interface QueryToken {
  ilike: string
  /** 한글·영숫자 외 문자를 제거하고 접두(:*)를 붙인 to_tsquery 항. 남는 글자가 없으면 null —
   *  그 토큰은 fts 조건 자체를 건너뛴다(빈 tsquery 로 쿼리를 보내지 않기 위함). */
  fts: string | null
}

// 509 2단계 — 'simple' 설정은 형태소 분석을 하지 않아 '엔비디아의'가 통째로 한 토큰이 된다.
// 접두 매칭(:*)이 없으면 조사 붙은 표기를 전부 놓친다(실측: '엔비디아' 완전일치 false / '엔비디아:*' true).
// 511 — ContentsBoard(콘텐츠 목록 화면 자체 검색)도 이 함수를 그대로 재사용한다.
// 전역 통합검색과 결과 집합이 갈라지면 안 되기 때문(export).
export function buildQueryTokens(q: string): QueryToken[] {
  return tokenizeQuery(q).map((token) => {
    const searchTerm = normalizeCompany(token) ?? token
    // 511 — ilike 값은 반드시 PostgREST 인용 형태("%…%")로 감싼다. 인용하지 않으면
    // 검색어에 콤마·괄호가 섞였을 때 or=(...) 필터 구분자로 잘못 쪼개져 400 이 난다
    // (교체 전 ContentsBoard 는 인용하고 있었는데 509 2단계에서 이 함수로 옮기며 빠졌다).
    // 순서 고정: 1) LIKE 이스케이프(%, _) → 2) PostgREST 인용 이스케이프(\, ") → 3) "%…%" 로 감싸기.
    const likeEscaped = searchTerm.replace(/[%_]/g, '\\$&')
    const pgEscaped = likeEscaped.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
    const ftsBase = searchTerm.replace(/[^\p{L}\p{N}]/gu, '')
    return {
      ilike: `"%${pgEscaped}%"`,
      fts: ftsBase ? `${ftsBase}:*` : null,
    }
  })
}

/** 각 토큰이 columns(ilike) 또는 ftsColumn(fts, 지정된 경우만) 중 하나에라도 등장해야 하는
 *  (OR across columns) AND (across tokens) 필터를 체이닝한다. */
export function applyTokenFilters<T extends { or: (filter: string) => T }>(
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
  signal: AbortSignal,
  sinceDays: number | null,
): Promise<UnifiedResult[]> {
  let query = applyTokenFilters(
    supabase.from('contents').select(
      // 514 — 태그는 content_keywords(keywords(name)) 조인이 아니라 matched_groups·
      // matched_keywords 원본을 tagsOf2로 통일 처리(다른 목록 화면과 같은 경로).
      'id, title, summary_ko, category, published_at, file_path, original_url, is_editor_pick, author, sources(name), matched_groups, matched_keywords'
    ),
    // 509 1단계 — body_original 에는 pg_trgm 인덱스가 없어 OR 로 묶이는 순간 인덱스 경로가
    // 버려지고 전량 스캔이 된다(운영 실측 8,166ms, authenticated statement_timeout 8,000ms
    // 초과 → 57014 상시 실패). title/summary_ko 만 ilike 대상으로 한다. .select() 의
    // body_original 은 그대로 둔다 — ContentRow 가 요약 폴백으로 쓴다.
    // 509 2단계 — search_vector(제목+요약+번역본문+원문본문, GIN 인덱스)로 본문 커버리지를
    // 되살린다. ilike 는 그대로 두고 fts 를 OR 로 추가만 한다(교체 아님).
    // 602 — SELECT 에서도 뺐다. 매칭 6,888행의 본문을 읽고 240행만 쓰던 것을 2단계로 나눴다.
    ['title', 'summary_ko'],
    tokens,
    'search_vector',
  ).eq('status', 'published')
  if (categories) query = query.in('category', categories)
  if (sinceDays !== null) {
    query = query.gte('published_at', new Date(Date.now() - sinceDays * 86_400_000).toISOString())
  }
  const startedAt = performance.now()
  const { data, error: err } = await query.abortSignal(signal).order('published_at', { ascending: false, nullsFirst: false }).limit(Math.max(cap, FETCH_LIMIT))
  console.debug('[search] contents 1단계', {
    ms: Math.round(performance.now() - startedAt),
    rows: data?.length ?? 0,
    sinceDays,
  })
  if (err) { console.error('[search] contents 조회 오류:', err); throw err }

  const rows = ((data ?? []) as unknown as Omit<ContentSearchRow, 'body_original'>[]).slice(0, cap)
  const ids = rows.map((row) => row.id)
  const bodyById = new Map<string, string | null>()
  const bodyStartedAt = performance.now()
  if (ids.length > 0) {
    const { rows: bodies, error: bodyError } = await fetchInChunks(ids, (chunk) =>
      supabase
        .from('contents')
        .select('id, body_original')
        .in('id', chunk)
        .abortSignal(signal)
    )
    if (bodyError) {
      console.warn('[search] contents 본문 조회 오류:', bodyError)
    }
    for (const body of bodies) {
      bodyById.set(body.id as string, body.body_original as string | null)
    }
  }
  console.debug('[search] contents.body', {
    ms: Math.round(performance.now() - bodyStartedAt),
    rows: bodyById.size,
    chunks: Math.ceil(ids.length / IN_FILTER_CHUNK_SIZE),
  })

  return rows.map(row => ({
    key: `content-${row.id}`,
    source: 'content' as const,
    sortDate: row.published_at ?? EPOCH,
    content: { ...row, body_original: bodyById.get(row.id) ?? null },
  }))
}

async function fetchInsights(supabase: SupabaseClient, tokens: QueryToken[], cap: number, signal: AbortSignal): Promise<UnifiedResult[]> {
  const query = applyTokenFilters(
    supabase.from('daily_insights').select('id, headline, summary_ko, day_of'),
    ['headline', 'summary_ko', 'market_trend', 'competitor_trend', 'implication'],
    tokens,
  ).eq('status', 'published')
  const startedAt = performance.now()
  const { data, error: err } = await query.abortSignal(signal).order('day_of', { ascending: false }).limit(Math.max(cap, FETCH_LIMIT))
  console.debug('[search] insights', { ms: Math.round(performance.now() - startedAt), rows: data?.length ?? 0 })
  if (err) { console.error('[search] daily_insights 조회 오류:', err); throwSearchFailure(err, 'insights') }
  return ((data ?? []) as DailyInsightRow[])
    .map(row => ({ key: `insight-${row.id}`, source: 'daily_insights' as const, sortDate: new Date(row.day_of).toISOString(), insight: row }))
    .slice(0, cap)
}

async function fetchIssues(supabase: SupabaseClient, tokens: QueryToken[], cap: number, signal: AbortSignal): Promise<UnifiedResult[]> {
  const query = applyTokenFilters(
    supabase.from('issues').select('id, title, summary, created_at'),
    ['title', 'summary'],
    tokens,
  ).eq('status', 'published')
  const startedAt = performance.now()
  const { data, error: err } = await query.abortSignal(signal).order('created_at', { ascending: false }).limit(Math.max(cap, FETCH_LIMIT))
  console.debug('[search] issues', { ms: Math.round(performance.now() - startedAt), rows: data?.length ?? 0 })
  if (err) { console.error('[search] issues 조회 오류:', err); throwSearchFailure(err, 'issues') }
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

async function fetchEntities(supabase: SupabaseClient, tokens: QueryToken[], cap: number, signal: AbortSignal): Promise<UnifiedResult[]> {
  const matchedStartedAt = performance.now()
  const { data: matched, error: err } = await applyTokenFilters(
    supabase.from('entities').select('id, canonical_name, description'),
    ['canonical_name', 'description'],
    tokens,
  ).abortSignal(signal).limit(FETCH_LIMIT)
  console.debug('[search] entities', { ms: Math.round(performance.now() - matchedStartedAt), rows: matched?.length ?? 0 })
  if (err) { console.error('[search] entities 조회 오류:', err); throwSearchFailure(err, 'entities') }
  const ids = (matched ?? []).map((e) => e.id as string)
  if (ids.length === 0) return []

  const linksStartedAt = performance.now()
  const { data: links, error: linkErr } = await supabase
    .from('content_entities')
    .select('entity_id, contents!inner(published_at)')
    .in('entity_id', ids)
    .eq('contents.status', 'published')
    .order('contents(published_at)', { ascending: false })
    .abortSignal(signal)
    .limit(LINK_FETCH_CAP)
  console.debug('[search] entities.links', { ms: Math.round(performance.now() - linksStartedAt), rows: links?.length ?? 0 })
  if (linkErr) { console.error('[search] content_entities 조회 오류:', linkErr); throwSearchFailure(linkErr, 'entities.links') }

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

async function fetchKeywords(supabase: SupabaseClient, tokens: QueryToken[], cap: number, signal: AbortSignal): Promise<UnifiedResult[]> {
  const matchedStartedAt = performance.now()
  const { data: matched, error: err } = await applyTokenFilters(
    supabase.from('keywords').select('id, name'),
    ['name'],
    tokens,
  ).abortSignal(signal).limit(FETCH_LIMIT)
  console.debug('[search] keywords', { ms: Math.round(performance.now() - matchedStartedAt), rows: matched?.length ?? 0 })
  if (err) { console.error('[search] keywords 조회 오류:', err); throwSearchFailure(err, 'keywords') }
  const ids = (matched ?? []).map((k) => k.id as string)
  if (ids.length === 0) return []

  const linksStartedAt = performance.now()
  const { data: links, error: linkErr } = await supabase
    .from('content_keywords')
    .select('keyword_id, contents!inner(published_at)')
    .in('keyword_id', ids)
    .eq('contents.status', 'published')
    .order('contents(published_at)', { ascending: false })
    .abortSignal(signal)
    .limit(LINK_FETCH_CAP)
  console.debug('[search] keywords.links', { ms: Math.round(performance.now() - linksStartedAt), rows: links?.length ?? 0 })
  if (linkErr) { console.error('[search] content_keywords 조회 오류:', linkErr); throwSearchFailure(linkErr, 'keywords.links') }

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
  signal: AbortSignal,
  sinceDays: number | null,
): Promise<UnifiedResult[]> {
  const def = searchFilterDef(key)
  if (def.source === 'content') return fetchContentCategory(supabase, tokens, def.categories, cap, signal, sinceDays)
  if (def.source === 'daily_insights') return fetchInsights(supabase, tokens, cap, signal)
  if (def.source === 'issues') return fetchIssues(supabase, tokens, cap, signal)
  if (def.source === 'entities') return fetchEntities(supabase, tokens, cap, signal)
  return fetchKeywords(supabase, tokens, cap, signal)
}

export function useUnifiedSearch(
  q: string,
  filter: SearchFilterKey | '',
  opts?: { sinceDays?: number | null },
): { sections: SearchSection[] | null; isLoading: boolean; error: string | null; notice: string | null; cancel: () => void } {
  const [sections, setSections] = useState<SearchSection[] | null>(null)
  const [isLoading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const controllerRef = useRef<AbortController | null>(null)
  const sinceDays = opts?.sinceDays ?? SEARCH_DEFAULT_SINCE_DAYS

  const cancel = () => {
    const controller = controllerRef.current
    if (!controller || controller.signal.aborted) return
    controller.abort()
    startTransition(() => {
      setLoading(false)
      setError(null)
      setNotice('검색을 취소했습니다.')
    })
  }

  useEffect(() => {
    if (!q) {
      startTransition(() => { setSections(null); setLoading(false); setError(null); setNotice(null) })
      return
    }

    let cancelled = false
    let requestTimeout: ReturnType<typeof setTimeout> | null = null
    const controller = new AbortController()
    controllerRef.current = controller
    startTransition(() => { setLoading(true); setError(null); setNotice(null) })

    // 509 — 타건마다 최대 7개 쿼리가 동시 발사되던 것을 300ms 디바운스로 묶는다.
    // q/filter 가 다시 바뀌면 클린업이 이 타이머를 지우므로 실제 요청은 타이핑이
    // 멈춘 뒤 1회만 나간다.
    const timer = setTimeout(() => {
      if (controller.signal.aborted) return
      const fetchResults = async () => {
        const supabase = createClient()
        const tokens = buildQueryTokens(q)

        requestTimeout = setTimeout(() => {
          if (controller.signal.aborted) return
          controller.abort()
          startTransition(() => {
            setLoading(false)
            setError(null)
            setNotice(SEARCH_ABORT_TIMEOUT_MESSAGE)
          })
        }, SEARCH_ABORT_TIMEOUT_MS)

        // 특정 카테고리 선택 시: 그 종류 하나만 조회, 표시 상한도 60(무회귀 — 기존 단독 필터와 동일)
        const keysToFetch = filter ? [filter] : SEARCH_SECTION_ORDER
        const capFor = (key: SearchFilterKey) => (filter ? FETCH_LIMIT : SEARCH_SECTION_DISPLAY_CAP[key])

        // 509 — 소스별 fetch 함수가 이제 실패 시 throw 하므로 Promise.all 대신
        // allSettled 로 받는다. 한 소스(예: 타임아웃)가 실패해도 나머지 fulfilled
        // 섹션은 그대로 렌더해야 한다 — 전체를 지우면 안 됨.
        //
        // 515 — filter 미지정(전체 검색)일 때, 콘텐츠 소스(뉴스·유튜브·기술 Blog·AI 리포트·
        // 컨설팅 리포트·공시자료) 6개는 각자 category IN(...) 조건으로 쿼리를 날리면 그
        // 조건이 인덱스를 안 타 전부 동일한 전량 스캔을 반복했다(콜드 캐시 8초 타임아웃
        // 원인). 이 경우에만 카테고리 조건 없는 단일 쿼리 하나로 합쳐서 가져오고, 응답을
        // category 로 나눠 각 섹션에 배분한다 — fetchSection 태스크 하나가 SearchSection
        // 여러 개를 반환할 수 있으므로 각 태스크는 SearchSection[] 를 돌려준다.
        // filter 지정(특정 카테고리 선택) 시엔 기존처럼 그 카테고리 하나만 조회(무회귀).
        const isContentKey = (key: SearchFilterKey) => searchFilterDef(key).source === 'content'
        const sourceNameFor = (key: SearchFilterKey) => {
          const source = searchFilterDef(key).source
          if (source === 'content') return `contents.${key}`
          if (source === 'daily_insights') return 'insights'
          return source
        }
        const tasks: { name: string; run: () => Promise<SearchSection[]> }[] = filter
          ? keysToFetch.map((key) => ({
              name: sourceNameFor(key),
              run: async () => [{ key, items: await fetchSection(supabase, key, tokens, capFor(key), controller.signal, sinceDays) }],
            }))
          : [
              {
                name: 'contents.merged',
                run: async (): Promise<SearchSection[]> => {
                  const contentKeys = keysToFetch.filter(isContentKey)
                  const merged = await fetchContentCategory(supabase, tokens, undefined, CONTENT_MERGE_LIMIT, controller.signal, sinceDays)
                  // 주의 — 발행일 내림차순으로 한 번에 CONTENT_MERGE_LIMIT(240)행만 받으므로,
                  // 검색어가 특정 카테고리(예: 뉴스)에 압도적으로 많이 매칭되면 그 카테고리가
                  // 240건을 거의 다 차지해 물량이 적은 다른 카테고리 섹션이 비어 보일 수 있다.
                  // 카테고리별 정확한 상한 보장이 아니라 "최신순 240건 중 이 카테고리 몫"이라는
                  // 한계 — 콜드 캐시 타임아웃 회피가 우선순위였던 절충이다.
                  return contentKeys.map((key) => {
                    const categories = searchFilterDef(key).categories ?? []
                    return {
                      key,
                      items: merged
                        .filter((r) => categories.includes(r.content!.category))
                        .slice(0, capFor(key)),
                    }
                  })
                },
              },
              ...keysToFetch
                .filter((key) => !isContentKey(key))
                .map((key) => ({
                  name: sourceNameFor(key),
                  run: async (): Promise<SearchSection[]> => [{ key, items: await fetchSection(supabase, key, tokens, capFor(key), controller.signal, sinceDays) }],
                })),
            ]

        const round1StartedAt = performance.now()
        const settled = await allSettledLimited(tasks.map((task) => task.run), SEARCH_QUERY_CONCURRENCY)
        console.debug('[search] round1', {
          ms: Math.round(performance.now() - round1StartedAt),
          tasks: tasks.length,
          concurrency: SEARCH_QUERY_CONCURRENCY,
        })
        if (cancelled || controller.signal.aborted) return

        const sectionOrderIndex = (key: SearchFilterKey) => SEARCH_SECTION_ORDER.indexOf(key)
        const fulfilled = settled
          .filter((r): r is PromiseFulfilledResult<SearchSection[]> => r.status === 'fulfilled')
          .flatMap((r) => r.value)
          // 콘텐츠 합류 태스크가 다른 태스크보다 먼저/나중에 끝나는 순서와 무관하게
          // 화면은 항상 SEARCH_SECTION_ORDER 고정 순서를 유지해야 한다(SearchResultsPanel의
          // '전체' 결과가 이 순서를 그대로 관련도순으로 쓴다).
          .sort((a, b) => sectionOrderIndex(a.key) - sectionOrderIndex(b.key))
        const rejected = settled
          .map((result, index) => ({ result, name: tasks[index].name }))
          .filter((item): item is { result: PromiseRejectedResult; name: string } =>
            item.result.status === 'rejected' && !isAbortError(item.result.reason)
          )

        // 515-2 — 병합 쿼리(발행일 내림차순 CONTENT_MERGE_LIMIT행)는 물량 많은 카테고리가
        // 창을 독점하면 물량 적은 카테고리가 통째로 빈다(실측: 'aidc' 매칭 1,265건 중
        // 뉴스가 1,263건이라 유튜브 2건이 240위 밖으로 밀려 섹션이 사라짐). 1라운드가
        // 끝난 뒤에만(동시 발사 금지 — 그게 원래 8초 타임아웃의 원인이었다) 0건으로 남은
        // 콘텐츠 섹션만 그 카테고리 하나로 다시 조회해 채운다. 1라운드가 이미 같은 힙
        // 블록을 읽어 캐시가 데워진 상태라 카테고리별 개별 쿼리도 빠르다(실측 20ms대).
        let finalSections = fulfilled
        if (!filter) {
          const emptyContentKeys = fulfilled
            .filter((s) => isContentKey(s.key) && s.items.length === 0)
            .map((s) => s.key)

          const round2StartedAt = performance.now()
          if (emptyContentKeys.length > 0) {
            const round2 = await allSettledLimited(
              emptyContentKeys.map((key) => async (): Promise<SearchSection> => ({
                key,
                items: await fetchSection(supabase, key, tokens, capFor(key), controller.signal, sinceDays),
              })),
              SEARCH_QUERY_CONCURRENCY,
            )
            if (cancelled || controller.signal.aborted) return
            // 2라운드 실패는 조용히 무시 — 1라운드 결과(빈 섹션 → 자동 숨김)를 그대로
            // 둔다. 별도 에러 배너는 띄우지 않는다(아래 에러 판정은 1라운드 rejected만 반영).
            const round2ByKey = new Map(
              round2
                .filter((r): r is PromiseFulfilledResult<SearchSection> => r.status === 'fulfilled')
                .map((r) => [r.value.key, r.value] as const)
            )
            finalSections = fulfilled.map((s) => round2ByKey.get(s.key) ?? s)
          }
          console.debug('[search] round2', {
            ms: Math.round(performance.now() - round2StartedAt),
            keys: emptyContentKeys,
          })
        }

        // 매칭 0건 종류는 섹션 자체를 숨김, 고정 순서(SEARCH_SECTION_ORDER) 유지
        const nonEmpty = finalSections.filter((s) => s.items.length > 0)
        setSections(nonEmpty)

        if (rejected.length > 0) {
          rejected.forEach(({ name, result }) => {
            const { code, message } = searchFailureDetails(result.reason)
            console.error(`[search] 실패: ${searchFailureSource(result.reason, name)} code=${code} message=${message}`)
          })
          const isTimeout = rejected.some(({ result }) =>
            (result.reason as { code?: string } | null)?.code === '57014'
          )
          setError(
            isTimeout
              ? '검색이 오래 걸려 중단되었습니다. 검색어를 좁혀서 다시 시도해주세요.'
              : '검색 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.'
          )
        } else {
          setError(null)
        }
        setLoading(false)
        if (requestTimeout) clearTimeout(requestTimeout)
        if (controllerRef.current === controller) controllerRef.current = null
      }

      fetchResults().catch(errorValue => {
        if (!cancelled && !isAbortError(errorValue)) {
          console.error('[search] 검색 중 오류:', errorValue)
          setError('검색 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.')
          setLoading(false)
        }
        if (requestTimeout) clearTimeout(requestTimeout)
        if (controllerRef.current === controller) controllerRef.current = null
      })
    }, 300)

    return () => {
      cancelled = true
      clearTimeout(timer)
      if (requestTimeout) clearTimeout(requestTimeout)
      controller.abort()
      if (controllerRef.current === controller) controllerRef.current = null
    }
  }, [q, filter, sinceDays])

  return { sections, isLoading, error, notice, cancel }
}

export { SEARCH_FILTER_DEFS }
