'use client'

import { Suspense, useEffect, useState, startTransition } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { CONTENT_CATEGORY_LABEL, type ContentCategory } from '@/lib/types'
import { Search, ExternalLink, FileText } from 'lucide-react'

// ─── 타입 ─────────────────────────────────────────────────────────────────────

interface SearchResult {
  id: string
  title: string
  summary_ko: string | null
  category: ContentCategory
  published_at: string | null
  file_path: string | null
  original_url: string | null
  is_editor_pick: boolean
  author: string | null
  sources: { name: string } | null
}

// ─── 상수 ────────────────────────────────────────────────────────────────────

const CATEGORY_STYLE: Partial<Record<ContentCategory, string>> = {
  '뉴스':    'bg-blue-50 text-blue-700 border-blue-100',
  '가트너':  'bg-purple-50 text-purple-700 border-purple-100',
  'KRG':    'bg-orange-50 text-orange-700 border-orange-100',
  '웹인사이트': 'bg-teal-50 text-teal-700 border-teal-100',
  '오피니언': 'bg-green-50 text-green-700 border-green-100',
  '뉴스레터': 'bg-indigo-50 text-indigo-700 border-indigo-100',
  'AI보고서': 'bg-pink-50 text-pink-700 border-pink-100',
  '유튜브':  'bg-red-50 text-red-700 border-red-100',
}

const MAX_RESULTS = 30

// ─── 헬퍼 ────────────────────────────────────────────────────────────────────

function formatDate(dateStr: string | null): string | null {
  if (!dateStr) return null
  return new Date(dateStr).toLocaleDateString('ko-KR', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

// ─── 스켈레톤 ─────────────────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div className="animate-pulse rounded-xl border border-border bg-card p-5">
      <div className="mb-3 flex gap-2">
        <div className="h-5 w-16 rounded-full bg-muted" />
      </div>
      <div className="mb-2 h-5 w-3/4 rounded bg-muted" />
      <div className="space-y-1.5">
        <div className="h-4 w-full rounded bg-muted" />
        <div className="h-4 w-5/6 rounded bg-muted" />
      </div>
      <div className="mt-3 flex gap-3">
        <div className="h-3.5 w-20 rounded bg-muted" />
        <div className="h-3.5 w-24 rounded bg-muted" />
      </div>
    </div>
  )
}

// ─── 결과 카드 ────────────────────────────────────────────────────────────────

function ResultCard({ item }: { item: SearchResult }) {
  const categoryStyle =
    CATEGORY_STYLE[item.category] ?? 'bg-muted text-muted-foreground border-border'
  const dateStr = formatDate(item.published_at)

  return (
    <article className="group rounded-xl border border-border bg-card p-5 transition-shadow hover:shadow-sm">
      <div className="flex items-start justify-between gap-4">
        {/* 왼쪽: 텍스트 */}
        <div className="min-w-0 flex-1">
          {/* 뱃지 */}
          <div className="mb-2 flex flex-wrap items-center gap-1.5">
            <span
              className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${categoryStyle}`}
            >
              {CONTENT_CATEGORY_LABEL[item.category] ?? item.category}
            </span>
            {item.is_editor_pick && (
              <span className="inline-flex items-center rounded-full border border-amber-100 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700">
                ⭐ 에디터 픽
              </span>
            )}
          </div>

          {/* 제목 */}
          <h2 className="mb-1.5 text-sm font-semibold leading-snug text-foreground transition-colors group-hover:text-brand-600">
            {item.title}
          </h2>

          {/* 요약 */}
          {item.summary_ko && (
            <p className="line-clamp-2 text-xs leading-relaxed text-muted-foreground">
              {item.summary_ko}
            </p>
          )}

          {/* 메타 */}
          <div className="mt-2.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px] text-muted-foreground">
            {item.sources?.name && (
              <span className="font-medium text-foreground">{item.sources.name}</span>
            )}
            {item.author && !item.sources?.name && <span>{item.author}</span>}
            <span>{dateStr ? `발행 ${dateStr}` : '발행일 미상'}</span>
          </div>
        </div>

        {/* 오른쪽: 액션 버튼 */}
        <div className="shrink-0 pt-0.5">
          {item.original_url ? (
            <a
              href={item.original_url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-brand-600 hover:text-brand-600"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              원문
            </a>
          ) : item.file_path ? (
            <span className="flex items-center gap-1.5 rounded-lg border border-border bg-muted px-3 py-1.5 text-xs font-medium text-muted-foreground">
              <FileText className="h-3.5 w-3.5" />
              리포트
            </span>
          ) : null}
        </div>
      </div>
    </article>
  )
}

// ─── 검색 컨텐츠 ──────────────────────────────────────────────────────────────

function SearchContent() {
  const searchParams = useSearchParams()
  const q = searchParams.get('q')?.trim() ?? ''

  const [results, setResults]   = useState<SearchResult[] | null>(null)
  const [isLoading, setLoading] = useState(false)
  const [error, setError]       = useState<string | null>(null)

  useEffect(() => {
    if (!q) {
      startTransition(() => { setResults(null); setLoading(false) })
      return
    }

    startTransition(() => { setLoading(true); setError(null) })

    const supabase = createClient()
    supabase
      .from('contents')
      .select(
        'id, title, summary_ko, category, published_at, file_path, original_url, is_editor_pick, author, sources(name)'
      )
      .textSearch('search_vector', q, { type: 'websearch', config: 'simple' })
      .eq('status', 'published')
      .order('published_at', { ascending: false, nullsFirst: false })
      .limit(MAX_RESULTS)
      .then(({ data, error: err }) => {
        if (err) {
          console.error('[search] FTS 쿼리 오류:', err)
          setError('검색 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.')
        } else {
          setResults((data ?? []) as unknown as SearchResult[])
        }
        setLoading(false)
      })
  }, [q])

  return (
    <div className="px-4 py-6 sm:px-6">
      {/* 브레드크럼 */}
      <div className="mb-6 flex items-center gap-2 text-sm text-muted-foreground">
        <Link href="/dashboard" className="transition-colors hover:text-brand-600">
          대시보드
        </Link>
        <span>›</span>
        <span className="font-medium text-foreground">검색</span>
        {q && (
          <>
            <span>›</span>
            <span className="max-w-xs truncate font-medium text-brand-600">
              &ldquo;{q}&rdquo;
            </span>
          </>
        )}
      </div>

      {/* 헤더 */}
      <div className="mb-6 flex items-center gap-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-muted">
          <Search className="h-4 w-4 text-muted-foreground" />
        </div>
        <div>
          <h1 className="text-lg font-bold text-foreground">
            {q ? `"${q}" 검색 결과` : '콘텐츠 검색'}
          </h1>
          {!isLoading && results !== null && (
            <p className="text-xs text-muted-foreground">
              총 {results.length}건
              {results.length === MAX_RESULTS && ' (최대 30건 표시)'}
            </p>
          )}
        </div>
      </div>

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
          {Array.from({ length: 5 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      )}

      {/* 에러 */}
      {q && error && (
        <div className="rounded-lg border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">
          {error}
        </div>
      )}

      {/* 결과 없음 */}
      {q && !isLoading && results !== null && results.length === 0 && (
        <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-border bg-card py-24 text-center">
          <span className="text-4xl">🔍</span>
          <p className="text-sm font-medium text-foreground">
            <span className="text-brand-600">&ldquo;{q}&rdquo;</span>에 대한 검색 결과가
            없습니다
          </p>
          <p className="text-xs text-muted-foreground">다른 키워드로 다시 검색해보세요</p>
        </div>
      )}

      {/* 결과 목록 */}
      {q && !isLoading && results !== null && results.length > 0 && (
        <div className="space-y-3">
          {results.map((item) => (
            <ResultCard key={item.id} item={item} />
          ))}
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
