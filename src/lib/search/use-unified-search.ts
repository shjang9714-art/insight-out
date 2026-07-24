'use client'

import { useEffect, useState, startTransition } from 'react'
import { createClient } from '@/lib/supabase/client'
import { type ContentCategory } from '@/lib/types'
import { normalizeCompany } from '@/lib/search/company-alias'
import { searchFilterDef, type SearchFilterKey } from '@/lib/search/search-filters'

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

export interface UnifiedResult {
  key: string
  source: 'content' | 'daily_insights' | 'issues'
  sortDate: string
  content?: ContentSearchRow
  insight?: DailyInsightRow
  issue?: IssueRow
}

const MAX_RESULTS = 60
const EPOCH = '1970-01-01T00:00:00.000Z'

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
      const activeDef = filter ? searchFilterDef(filter) : null
      const wantsContent = !activeDef || activeDef.source === 'content'
      const wantsInsight = !activeDef || activeDef.source === 'daily_insights'
      const wantsIssue = !activeDef || activeDef.source === 'issues'
      const contentCategories = activeDef?.source === 'content' ? activeDef.categories : undefined

      const fetchContents = async (): Promise<UnifiedResult[]> => {
        if (!wantsContent) return []
        const orFilter = [`title.ilike.${ilikePat}`, `summary_ko.ilike.${ilikePat}`, `body_original.ilike.${ilikePat}`].join(',')
        let query = supabase.from('contents').select(
          'id, title, summary_ko, body_original, category, published_at, file_path, original_url, is_editor_pick, author, sources(name), content_keywords(keywords(name)), content_services(services(name))'
        ).or(orFilter).eq('status', 'published')
        if (contentCategories) query = query.in('category', contentCategories)
        const { data, error: err } = await query.order('published_at', { ascending: false, nullsFirst: false }).limit(MAX_RESULTS)
        if (err) { console.error('[search] contents 조회 오류:', err); return [] }
        return ((data ?? []) as unknown as ContentSearchRow[]).map(row => ({ key: `content-${row.id}`, source: 'content' as const, sortDate: row.published_at ?? EPOCH, content: row }))
      }

      const fetchInsights = async (): Promise<UnifiedResult[]> => {
        if (!wantsInsight) return []
        const orFilter = ['headline', 'summary_ko', 'market_trend', 'competitor_trend', 'implication'].map(field => `${field}.ilike.${ilikePat}`).join(',')
        const { data, error: err } = await supabase.from('daily_insights').select('id, headline, summary_ko, day_of').or(orFilter).eq('status', 'published').order('day_of', { ascending: false }).limit(MAX_RESULTS)
        if (err) { console.error('[search] daily_insights 조회 오류:', err); return [] }
        return ((data ?? []) as DailyInsightRow[]).map(row => ({ key: `insight-${row.id}`, source: 'daily_insights' as const, sortDate: new Date(row.day_of).toISOString(), insight: row }))
      }

      const fetchIssues = async (): Promise<UnifiedResult[]> => {
        if (!wantsIssue) return []
        const orFilter = [`title.ilike.${ilikePat}`, `summary.ilike.${ilikePat}`].join(',')
        const { data, error: err } = await supabase.from('issues').select('id, title, summary, created_at').or(orFilter).eq('status', 'published').order('created_at', { ascending: false }).limit(MAX_RESULTS)
        if (err) { console.error('[search] issues 조회 오류:', err); return [] }
        return ((data ?? []) as IssueRow[]).map(row => ({ key: `issue-${row.id}`, source: 'issues' as const, sortDate: row.created_at, issue: row }))
      }

      const [contentResults, insightResults, issueResults] = await Promise.all([fetchContents(), fetchInsights(), fetchIssues()])
      if (!cancelled) {
        setResults([...contentResults, ...insightResults, ...issueResults].sort((a, b) => b.sortDate.localeCompare(a.sortDate)).slice(0, MAX_RESULTS))
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
