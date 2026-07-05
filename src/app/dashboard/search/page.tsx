'use client'

import { Suspense, useEffect, useState, startTransition } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { type ContentCategory } from '@/lib/types'
import { Search, Sparkles } from 'lucide-react'
import ContentRow from '@/components/dashboard/ContentRow'
import { tagsOf } from '@/lib/contents/excerpt'
import SuggestedQuestions from '@/components/search/SuggestedQuestions'

// ─── 타입 ────────────────────────────────────────────────────────────────────

interface SearchResult {
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
  matchedBy?: 'title' | 'summary' | 'body' | 'keyword'
}

interface RagSource { content_id: string; title: string; published_at: string | null; source: string | null }
interface RagAnswerData { answer: string; citations: string[]; sources: RagSource[] }
type RagState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'done'; data: RagAnswerData }
  | { status: 'none' }

// ─── 상수 ────────────────────────────────────────────────────────────────────

const MAX_RESULTS = 60

// ─── 헬퍼 ────────────────────────────────────────────────────────────────────

function getKeywords(item: SearchResult): string[] {
  return item.content_keywords.map((ck) => ck.keywords?.name).filter((n): n is string => Boolean(n))
}

function getServices(item: SearchResult): string[] {
  return item.content_services.map((cs) => cs.services?.name).filter((n): n is string => Boolean(n))
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

  const [results, setResults]   = useState<SearchResult[] | null>(null)
  const [isLoading, setLoading] = useState(false)
  const [error, setError]       = useState<string | null>(null)

  // AI 답변
  const [ragState, setRagState] = useState<RagState>({ status: 'idle' })

  // ILIKE 멀티컬럼 검색 (제목·요약·본문)
  useEffect(() => {
    if (!q) {
      startTransition(() => { setResults(null); setLoading(false) })
      return
    }

    let cancelled = false
    startTransition(() => { setLoading(true); setError(null) })

    const fetchResults = async () => {
      const supabase = createClient()

      // ILIKE 멀티컬럼 OR 검색 (title·summary_ko·body_original 커버)
      // FTS(search_vector)는 body_original·matched_keywords 미포함으로 단어 누락 발생 → ILIKE 대체
      const escapedQ = q.replace(/[%_]/g, '\\$&')
      const ilikePat = `%${escapedQ}%`
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

      if (!cancelled) {
        if (err) {
          console.error('[search] 검색 쿼리 오류:', err)
          setError('검색 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.')
        } else {
          setResults((data ?? []) as unknown as SearchResult[])
        }
        setLoading(false)
      }
    }

    fetchResults()
    return () => { cancelled = true }
  }, [q])

  // RAG AI 답변 (검색어 변경 시)
  useEffect(() => {
    if (!q) { startTransition(() => setRagState({ status: 'idle' })); return }

    let cancelled = false
    startTransition(() => setRagState({ status: 'loading' }))

    fetch('/api/search/rag', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: q }),
    })
      .then(r => r.json())
      .then((data: unknown) => {
        if (cancelled) return
        const d = data as Record<string, unknown>
        if (typeof d.answer === 'string' && d.answer) {
          setRagState({
            status: 'done',
            data: {
              answer: d.answer,
              citations: Array.isArray(d.citations) ? d.citations as string[] : [],
              sources: Array.isArray(d.sources) ? d.sources as RagSource[] : [],
            },
          })
        } else {
          setRagState({ status: 'none' })
        }
      })
      .catch(() => { if (!cancelled) setRagState({ status: 'none' }) })

    return () => { cancelled = true }
  }, [q])

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

      {/* AI 답변 카드 — 결과/빈화면보다 먼저 노출 */}
      {q && ragState.status === 'loading' && (
        <div className="mb-5 flex items-center gap-2.5 rounded-xl border border-brand-100 bg-brand-50/60 px-5 py-4 text-sm font-medium text-brand-700">
          <Sparkles className="h-4 w-4 shrink-0 animate-pulse text-brand-600" />
          <span>AI가 수집된 기사를 바탕으로 답변을 작성하고 있어요</span>
          <span className="ml-0.5 flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-brand-600 animate-bounce [animation-delay:-0.3s]" />
            <span className="h-2 w-2 rounded-full bg-brand-600 animate-bounce [animation-delay:-0.15s]" />
            <span className="h-2 w-2 rounded-full bg-brand-600 animate-bounce" />
          </span>
        </div>
      )}
      {q && ragState.status === 'done' && (
        <>
          {/* AI 답변 카드 */}
          <div className="mb-4 rounded-xl border border-border bg-card px-5 py-4 space-y-3">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 shrink-0 text-brand-600" />
              <span className="text-sm font-semibold text-foreground">AI 답변</span>
              <span className="text-xs text-muted-foreground">수집된 기사들을 근거로 정리했어요.</span>
            </div>
            <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">{ragState.data.answer}</p>
          </div>

          {/* 관련 기사 — 답변 근거 출처 */}
          {ragState.data.sources.length > 0 && (
            <div className="mb-5 rounded-xl border border-border bg-card px-5 py-4 space-y-3">
              <div className="flex items-center gap-2">
                <Search className="h-4 w-4 shrink-0 text-brand-600" />
                <span className="text-sm font-semibold text-foreground">관련 기사</span>
                <span className="text-xs text-muted-foreground">답변의 근거예요. 관련 기사를 확인하세요.</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {ragState.data.sources.map(s => (
                  <Link
                    key={s.content_id}
                    href={`/dashboard/contents/${s.content_id}`}
                    className="inline-flex items-center gap-1 rounded-full border border-brand-100 bg-brand-50 px-2.5 py-0.5 text-[11px] font-medium text-brand-700 hover:bg-brand-100 transition-colors line-clamp-1 max-w-[240px]"
                  >
                    {s.title}
                  </Link>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* 결과 없음 — AI 답변이 있으면 컴팩트 안내, 답변 로딩 중엔 숨김 */}
      {q && !isLoading && results !== null && results.length === 0 && !error && (
        ragState.status === 'done' ? (
          <p className="rounded-xl border border-border bg-card px-5 py-4 text-center text-xs text-muted-foreground">
            &ldquo;{q}&rdquo;와 정확히 일치하는 기사는 없어요. 위 AI 답변의 출처 기사를 확인해보세요.
          </p>
        ) : ragState.status === 'loading' ? null : (
          <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-border bg-card py-24 text-center">
            <span className="text-4xl">🔍</span>
            <p className="text-sm font-medium text-foreground">
              <span className="text-brand-600">&ldquo;{q}&rdquo;</span>에 대한 검색 결과가 없습니다
            </p>
            <p className="text-xs text-muted-foreground">다른 키워드로 다시 검색해보세요</p>
          </div>
        )
      )}

      {/* 결과 목록 */}
      {q && !isLoading && results !== null && results.length > 0 && (
        <div className="space-y-2">
          {results.map((item) => (
            <ContentRow
              key={item.id}
              id={item.id}
              title={item.title}
              summaryKo={item.summary_ko}
              bodyOriginal={item.body_original}
              category={item.category}
              publishedAt={item.published_at}
              originalUrl={item.original_url}
              filePath={item.file_path}
              isEditorPick={item.is_editor_pick}
              author={item.author}
              sourceName={item.sources?.name ?? null}
              keywords={tagsOf(getKeywords(item), item.category, getServices(item))}
            />
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
