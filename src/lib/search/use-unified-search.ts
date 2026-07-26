'use client'

import { useEffect, useState, startTransition } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/client'
import { type ContentCategory } from '@/lib/types'
import { normalizeCompany } from '@/lib/search/company-alias'
import { SEARCH_FILTER_DEFS, searchFilterDef, type SearchFilterKey } from '@/lib/search/search-filters'

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
  content_services: { services: { name: string } | null }[]
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

export interface EntityRow {
  id: string
  canonical_name: string
  description: string | null
  updated_at: string
}

export interface KeywordRow {
  name: string
  created_at: string
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

const MAX_RESULTS = 60
// 소스(=카테고리)별 조회 상한 — 기존 60건 상한과 동일하게 유지해 무회귀(각 종류 단독 필터 시 캡 축소 없음)
const FETCH_LIMIT = 60
// '전체' 병합 시 종류당 최소 보장 노출 수 — 매칭 있는 종류가 반드시 화면에 뜨게 하면서 한 종류가 60칸을 독식 못 하게 막는 값
const GUARANTEE_PER_SOURCE = 6
const EPOCH = '1970-01-01T00:00:00.000Z'

type Bucket = { key: SearchFilterKey | 'content-all'; items: UnifiedResult[] }

function sortDesc(items: UnifiedResult[]): UnifiedResult[] {
  return [...items].sort((a, b) => b.sortDate.localeCompare(a.sortDate))
}

/** 종류별 상한 없이 병합하면 매칭 많은 종류가 60칸을 독식(예: 뉴스만 보임) → 종류당 최소 보장 후 잔여를 최신순으로 채움 */
function mergeWithFairness(buckets: Bucket[]): UnifiedResult[] {
  const guaranteed: UnifiedResult[] = []
  const overflow: UnifiedResult[] = []
  for (const bucket of buckets) {
    const sorted = sortDesc(bucket.items)
    guaranteed.push(...sorted.slice(0, GUARANTEE_PER_SOURCE))
    overflow.push(...sorted.slice(GUARANTEE_PER_SOURCE))
  }
  const remaining = MAX_RESULTS - guaranteed.length
  const overflowFill = remaining > 0 ? sortDesc(overflow).slice(0, remaining) : []
  return sortDesc([...guaranteed, ...overflowFill])
}

async function fetchContentCategory(
  supabase: SupabaseClient,
  ilikePat: string,
  categories: ContentCategory[] | undefined,
): Promise<UnifiedResult[]> {
  const orFilter = [`title.ilike.${ilikePat}`, `summary_ko.ilike.${ilikePat}`, `body_original.ilike.${ilikePat}`].join(',')
  let query = supabase.from('contents').select(
    'id, title, summary_ko, body_original, category, published_at, file_path, original_url, is_editor_pick, author, sources(name), content_keywords(keywords(name)), content_services(services(name))'
  ).or(orFilter).eq('status', 'published')
  if (categories) query = query.in('category', categories)
  const { data, error: err } = await query.order('published_at', { ascending: false, nullsFirst: false }).limit(FETCH_LIMIT)
  if (err) { console.error('[search] contents 조회 오류:', err); return [] }
  return ((data ?? []) as unknown as ContentSearchRow[]).map(row => ({ key: `content-${row.id}`, source: 'content' as const, sortDate: row.published_at ?? EPOCH, content: row }))
}

async function fetchInsights(supabase: SupabaseClient, ilikePat: string): Promise<UnifiedResult[]> {
  const orFilter = ['headline', 'summary_ko', 'market_trend', 'competitor_trend', 'implication'].map(field => `${field}.ilike.${ilikePat}`).join(',')
  const { data, error: err } = await supabase.from('daily_insights').select('id, headline, summary_ko, day_of').or(orFilter).eq('status', 'published').order('day_of', { ascending: false }).limit(FETCH_LIMIT)
  if (err) { console.error('[search] daily_insights 조회 오류:', err); return [] }
  return ((data ?? []) as DailyInsightRow[]).map(row => ({ key: `insight-${row.id}`, source: 'daily_insights' as const, sortDate: new Date(row.day_of).toISOString(), insight: row }))
}

async function fetchIssues(supabase: SupabaseClient, ilikePat: string): Promise<UnifiedResult[]> {
  const orFilter = [`title.ilike.${ilikePat}`, `summary.ilike.${ilikePat}`].join(',')
  const { data, error: err } = await supabase.from('issues').select('id, title, summary, created_at').or(orFilter).eq('status', 'published').order('created_at', { ascending: false }).limit(FETCH_LIMIT)
  if (err) { console.error('[search] issues 조회 오류:', err); return [] }
  return ((data ?? []) as IssueRow[]).map(row => ({ key: `issue-${row.id}`, source: 'issues' as const, sortDate: row.created_at, issue: row }))
}

async function fetchEntities(supabase: SupabaseClient, ilikePat: string): Promise<UnifiedResult[]> {
  const orFilter = [`canonical_name.ilike.${ilikePat}`, `description.ilike.${ilikePat}`].join(',')
  const { data, error: err } = await supabase.from('entities').select('id, canonical_name, description, updated_at').or(orFilter).order('updated_at', { ascending: false }).limit(FETCH_LIMIT)
  if (err) { console.error('[search] entities 조회 오류:', err); return [] }
  return ((data ?? []) as EntityRow[]).map(row => ({ key: `entity-${row.id}`, source: 'entities' as const, sortDate: row.updated_at, entity: row }))
}

async function fetchKeywords(supabase: SupabaseClient, ilikePat: string): Promise<UnifiedResult[]> {
  const { data, error: err } = await supabase.from('keywords').select('name, created_at').ilike('name', ilikePat).order('created_at', { ascending: false }).limit(FETCH_LIMIT)
  if (err) { console.error('[search] keywords 조회 오류:', err); return [] }
  return ((data ?? []) as KeywordRow[]).map(row => ({ key: `keyword-${row.name}`, source: 'keywords' as const, sortDate: row.created_at, keyword: row }))
}

export function useUnifiedSearch(
  q: string,
  filter: SearchFilterKey | '',
): { results: UnifiedResult[] | null; isLoading: boolean; error: string | null } {
  const [results, setResults] = useState<UnifiedResult[] | null>(null)
  const [isLoading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!q) {
      startTransition(() => { setResults(null); setLoading(false); setError(null) })
      return
    }

    let cancelled = false
    startTransition(() => { setLoading(true); setError(null) })

    const fetchResults = async () => {
      const supabase = createClient()
      const searchTerm = normalizeCompany(q) ?? q
      const escapedQ = searchTerm.replace(/[%_]/g, '\\$&')
      const ilikePat = `%${escapedQ}%`

      // 특정 카테고리 선택 시: 해당 소스만 조회, 기존처럼 최대 60건 그대로(무회귀)
      if (filter) {
        const def = searchFilterDef(filter)
        let items: UnifiedResult[] = []
        if (def.source === 'content') items = await fetchContentCategory(supabase, ilikePat, def.categories)
        else if (def.source === 'daily_insights') items = await fetchInsights(supabase, ilikePat)
        else if (def.source === 'issues') items = await fetchIssues(supabase, ilikePat)
        else if (def.source === 'entities') items = await fetchEntities(supabase, ilikePat)
        else if (def.source === 'keywords') items = await fetchKeywords(supabase, ilikePat)
        if (!cancelled) {
          setResults(sortDesc(items).slice(0, MAX_RESULTS))
          setLoading(false)
        }
        return
      }

      // '전체': 콘텐츠는 카테고리 계위(뉴스/유튜브/웹인사이트/리포트)별로 나눠 각각 하나의 종류로 취급 —
      // 그래야 뉴스가 물량으로 다른 종류를 밀어내지 않고 종류별 최소 노출이 보장된다.
      const contentDefs = SEARCH_FILTER_DEFS.filter(d => d.source === 'content')
      const [contentBuckets, insightItems, issueItems, entityItems, keywordItems] = await Promise.all([
        Promise.all(contentDefs.map(async (def): Promise<Bucket> => ({
          key: def.key,
          items: await fetchContentCategory(supabase, ilikePat, def.categories),
        }))),
        fetchInsights(supabase, ilikePat),
        fetchIssues(supabase, ilikePat),
        fetchEntities(supabase, ilikePat),
        fetchKeywords(supabase, ilikePat),
      ])

      if (!cancelled) {
        const buckets: Bucket[] = [
          ...contentBuckets,
          { key: 'insight', items: insightItems },
          { key: 'issue', items: issueItems },
          { key: 'company', items: entityItems },
          { key: 'keyword', items: keywordItems },
        ]
        setResults(mergeWithFairness(buckets))
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
    return () => { cancelled = true }
  }, [q, filter])

  return { results, isLoading, error }
}
