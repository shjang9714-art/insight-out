'use client'

import { Suspense, useEffect, useState, startTransition } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { type ContentCategory } from '@/lib/types'
import { Search } from 'lucide-react'
import ContentRow from '@/components/dashboard/ContentRow'
import SearchResultCard from '@/components/dashboard/SearchResultCard'
import { tagsOf } from '@/lib/contents/excerpt'
import { normalizeCompany } from '@/lib/search/company-alias'
import { MATERIAL_TYPE_DEFS, isMaterialType, type MaterialType } from '@/lib/search/material-types'
import SuggestedQuestions from '@/components/search/SuggestedQuestions'

// ─── 타입 ────────────────────────────────────────────────────────────────────

interface ContentSearchRow {
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

interface DailyInsightRow {
  id: string
  headline: string
  summary_ko: string | null
  day_of: string
}

interface IssueRow {
  id: string
  title: string
  summary: string | null
  created_at: string
}

/** 통합 검색 결과 — 자료 종류별 원본 row 를 공통 카드 렌더용으로 정규화 */
interface UnifiedResult {
  key: string
  type: MaterialType
  sortDate: string // ISO — 병합 정렬용
  content?: ContentSearchRow
  insight?: DailyInsightRow
  issue?: IssueRow
}

// ─── 상수 ────────────────────────────────────────────────────────────────────

const MAX_RESULTS = 60
const EPOCH = '1970-01-01T00:00:00.000Z'

// ─── 헬퍼 ────────────────────────────────────────────────────────────────────

function getKeywords(item: ContentSearchRow): string[] {
  return item.content_keywords.map((ck) => ck.keywords?.name).filter((n): n is string => Boolean(n))
}

function getServices(item: ContentSearchRow): string[] {
  return item.content_services.map((cs) => cs.services?.name).filter((n): n is string => Boolean(n))
}

function typeBadgeOf(type: MaterialType) {
  const def = MATERIAL_TYPE_DEFS.find((d) => d.type === type)!
  return { label: def.label, className: def.badgeClass }
}

// ─── 서브 컴포넌트 ────────────────────────────────────────────────────────────

function SkeletonRow() {
  return (
    <div className="animate-pulse rounded-xl border border-border bg-card px-5 py-4">
      <div className="mb-2 flex gap-1.5">
        <div className="h-4 w-14 rounded-md bg-muted" />
        <div className="h-4 w-16 rounded-md bg-muted" />
      </div>
      <div className="mb-1.5 h-4 w-3/4 rounded bg-muted" />
      <div className="h-3 w-1/2 rounded bg-muted" />
    </div>
  )
}

// ─── 검색 컨텐츠 ──────────────────────────────────────────────────────────────

function SearchContent() {
  const searchParams = useSearchParams()

  const q = searchParams.get('q')?.trim() ?? ''
  const rawType = searchParams.get('type')
  const typeFilter: MaterialType | '' = isMaterialType(rawType) ? rawType : ''

  const [results, setResults]   = useState<UnifiedResult[] | null>(null)
  const [isLoading, setLoading] = useState(false)
  const [error, setError]       = useState<string | null>(null)

  // 전체 자료 종류(콘텐츠·인사이트·보고서·이슈) 통합 검색 — ILIKE 멀티컬럼, 자료 종류별 병렬 조회 후 병합
  useEffect(() => {
    if (!q) {
      startTransition(() => { setResults(null); setLoading(false) })
      return
    }

    let cancelled = false
    startTransition(() => { setLoading(true); setError(null) })

    const fetchResults = async () => {
      const supabase = createClient()

      // FTS(search_vector)는 body_original·matched_keywords 미포함으로 단어 누락 발생 → ILIKE 대체(기존 검색 회귀 이력)
      // 회사 별칭 정규화: 'lguplus' → 'LG유플러스' (영문 슬러그가 한글 기사에 안 걸리는 문제 보정)
      const searchTerm = normalizeCompany(q) ?? q
      const escapedQ = searchTerm.replace(/[%_]/g, '\\$&')
      const ilikePat = `%${escapedQ}%`

      const wantsType = (t: MaterialType) => !typeFilter || typeFilter === t

      const fetchContents = async (): Promise<UnifiedResult[]> => {
        if (!wantsType('content')) return []
        const orFilter = [
          `title.ilike.${ilikePat}`,
          `summary_ko.ilike.${ilikePat}`,
          `body_original.ilike.${ilikePat}`,
        ].join(',')
        const { data, error: err } = await supabase
          .from('contents')
          .select(
            'id, title, summary_ko, body_original, category, published_at, file_path, original_url, is_editor_pick, author, sources(name), content_keywords(keywords(name)), content_services(services(name))'
          )
          .or(orFilter)
          .eq('status', 'published')
          .order('published_at', { ascending: false, nullsFirst: false })
          .limit(MAX_RESULTS)
        if (err) { console.error('[search] contents 조회 오류:', err); return [] }
        return ((data ?? []) as unknown as ContentSearchRow[]).map((row) => ({
          key: `content-${row.id}`,
          type: 'content' as const,
          sortDate: row.published_at ?? EPOCH,
          content: row,
        }))
      }

      const fetchInsights = async (): Promise<UnifiedResult[]> => {
        if (!wantsType('insight')) return []
        const orFilter = [
          `headline.ilike.${ilikePat}`,
          `summary_ko.ilike.${ilikePat}`,
          `market_trend.ilike.${ilikePat}`,
          `competitor_trend.ilike.${ilikePat}`,
          `implication.ilike.${ilikePat}`,
        ].join(',')
        const { data, error: err } = await supabase
          .from('daily_insights')
          .select('id, headline, summary_ko, day_of')
          .or(orFilter)
          .eq('status', 'published')
          .order('day_of', { ascending: false })
          .limit(MAX_RESULTS)
        if (err) { console.error('[search] daily_insights 조회 오류:', err); return [] }
        return ((data ?? []) as DailyInsightRow[]).map((row) => ({
          key: `insight-${row.id}`,
          type: 'insight' as const,
          sortDate: new Date(row.day_of).toISOString(),
          insight: row,
        }))
      }

      const fetchIssues = async (): Promise<UnifiedResult[]> => {
        if (!wantsType('issue')) return []
        const orFilter = [
          `title.ilike.${ilikePat}`,
          `summary.ilike.${ilikePat}`,
        ].join(',')
        const { data, error: err } = await supabase
          .from('issues')
          .select('id, title, summary, created_at')
          .or(orFilter)
          .eq('status', 'published')
          .order('created_at', { ascending: false })
          .limit(MAX_RESULTS)
        if (err) { console.error('[search] issues 조회 오류:', err); return [] }
        return ((data ?? []) as IssueRow[]).map((row) => ({
          key: `issue-${row.id}`,
          type: 'issue' as const,
          sortDate: row.created_at,
          issue: row,
        }))
      }

      const [contentResults, insightResults, issueResults] = await Promise.all([
        fetchContents(), fetchInsights(), fetchIssues(),
      ])

      if (!cancelled) {
        const merged = [...contentResults, ...insightResults, ...issueResults]
          .sort((a, b) => b.sortDate.localeCompare(a.sortDate))
          .slice(0, MAX_RESULTS)
        setResults(merged)
        setLoading(false)
      }
    }

    fetchResults().catch((e) => {
      if (!cancelled) {
        console.error('[search] 검색 중 오류:', e)
        setError('검색 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.')
        setLoading(false)
      }
    })
    return () => { cancelled = true }
  }, [q, typeFilter])

  return (
    <div className="px-4 py-6 sm:px-6">
      {/* 브레드크럼 */}
      <div className="mb-6 flex items-center gap-2 text-sm text-muted-foreground">
        <Link href="/dashboard" className="transition-colors hover:text-brand-600">대시보드</Link>
        <span>›</span>
        <span className="font-medium text-foreground">검색</span>
        {q && (
          <>
            <span>›</span>
            <span className="max-w-xs truncate font-medium text-brand-600">&ldquo;{q}&rdquo;</span>
          </>
        )}
      </div>

      {/* 헤더 */}
      <div className="mb-5 flex items-start gap-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-muted">
          <Search className="h-4 w-4 text-muted-foreground" />
        </div>
        <div>
          <h1 className="text-lg font-bold text-foreground">
            {q ? `"${q}" 검색 결과` : '콘텐츠 검색'}
          </h1>
          {!isLoading && results !== null && (
            <p className="text-xs text-muted-foreground">
              총 {results.length}건{results.length === MAX_RESULTS && ' (최대 60건 표시)'}
            </p>
          )}
        </div>
      </div>

      {/* 추천 질문 칩 — q 없을 때만 */}
      {!q && <SuggestedQuestions className="mb-6" />}

      {/* 검색어 없음 */}
      {!q && (
        <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border py-24 text-center">
          <Search className="h-8 w-8 text-muted-foreground/40" />
          <p className="text-sm font-medium text-muted-foreground">검색어를 입력해주세요</p>
          <p className="text-xs text-muted-foreground">
            상단 검색창에 제목이나 요약 키워드를 입력하고 Enter 를 누르세요
          </p>
        </div>
      )}

      {/* 로딩 */}
      {q && isLoading && (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} />)}
        </div>
      )}

      {/* 에러 */}
      {q && error && (
        <div className="rounded-lg border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">
          {error}
        </div>
      )}

      {/* 결과 없음 */}
      {q && !isLoading && results !== null && results.length === 0 && !error && (
        <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-border bg-card py-24 text-center">
          <span className="text-4xl">🔍</span>
          <p className="text-sm font-medium text-foreground">
            <span className="text-brand-600">&ldquo;{q}&rdquo;</span>에 대한 검색 결과가 없습니다
          </p>
          <p className="text-xs text-muted-foreground">다른 키워드로 다시 검색해보세요</p>
        </div>
      )}

      {/* 결과 목록 */}
      {q && !isLoading && results !== null && results.length > 0 && (
        <div className="space-y-2">
          {results.map((item) => {
            if (item.type === 'content' && item.content) {
              const c = item.content
              return (
                <ContentRow
                  key={item.key}
                  id={c.id}
                  title={c.title}
                  summaryKo={c.summary_ko}
                  bodyOriginal={c.body_original}
                  category={c.category}
                  publishedAt={c.published_at}
                  originalUrl={c.original_url}
                  filePath={c.file_path}
                  isEditorPick={c.is_editor_pick}
                  author={c.author}
                  sourceName={c.sources?.name ?? null}
                  keywords={tagsOf(getKeywords(c), c.category, getServices(c))}
                  typeBadge={typeBadgeOf('content')}
                />
              )
            }
            if (item.type === 'insight' && item.insight) {
              const it = item.insight
              return (
                <SearchResultCard
                  key={item.key}
                  href={`/dashboard/daily-insights/${it.id}`}
                  title={it.headline}
                  excerpt={it.summary_ko}
                  publishedAt={it.day_of}
                  typeBadge={typeBadgeOf('insight')}
                />
              )
            }
            if (item.type === 'issue' && item.issue) {
              const i = item.issue
              return (
                <SearchResultCard
                  key={item.key}
                  href={`/dashboard/issues/${i.id}`}
                  title={i.title}
                  excerpt={i.summary}
                  publishedAt={i.created_at}
                  typeBadge={typeBadgeOf('issue')}
                />
              )
            }
            return null
          })}
        </div>
      )}
    </div>
  )
}

// ─── 페이지 ───────────────────────────────────────────────────────────────────

export default function SearchPage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-muted-foreground">로딩 중...</div>}>
      <SearchContent />
    </Suspense>
  )
}
