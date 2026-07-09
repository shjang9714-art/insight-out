'use client'

import { useState, useEffect, useCallback, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { FileText, Search, Loader2, CheckSquare, Square } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import type { AiReportType } from '@/lib/types'
import PageContainer from '@/components/PageContainer'
import BackLink from '@/components/BackLink'

const REPORT_TYPES: AiReportType[] = ['시장동향', '경쟁사분석', '키워드분석', '서비스리포트', '자유주제']

interface IssueRow {
  id: string
  title: string
  summary: string | null
}

interface ContentRow {
  id: string
  title: string
  category: string | null
}

function WorkbenchForm() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [reportType, setReportType] = useState<AiReportType>(() => {
    const t = searchParams.get('type') as AiReportType | null
    return t && REPORT_TYPES.includes(t) ? t : '시장동향'
  })
  const [issues, setIssues] = useState<IssueRow[]>([])
  const [selectedIssueIds, setSelectedIssueIds] = useState<Set<string>>(() => {
    const id = searchParams.get('issue')
    return id ? new Set([id]) : new Set()
  })
  const [contentSearch, setContentSearch] = useState('')
  const [contentResults, setContentResults] = useState<ContentRow[]>([])
  const [selectedContentIds, setSelectedContentIds] = useState<Set<string>>(new Set())
  const [reportTitle, setReportTitle] = useState('')
  const [isSearching, setIsSearching] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // published 이슈 목록 로드
  useEffect(() => {
    const supabase = createClient()
    supabase
      .from('issues')
      .select('id, title, summary')
      .in('status', ['published'])
      .order('created_at', { ascending: false })
      .limit(50)
      .then(({ data }) => setIssues((data ?? []) as IssueRow[]))
  }, [])

  // 콘텐츠 검색 (debounce)
  const searchContents = useCallback(async (q: string) => {
    if (q.trim().length < 2) {
      setContentResults([])
      return
    }
    setIsSearching(true)
    const supabase = createClient()
    const { data } = await supabase
      .from('contents')
      .select('id, title, category')
      .ilike('title', `%${q.trim()}%`)
      .eq('status', 'published')
      .order('collected_at', { ascending: false })
      .limit(20)
    setContentResults((data ?? []) as ContentRow[])
    setIsSearching(false)
  }, [])

  useEffect(() => {
    const t = setTimeout(() => searchContents(contentSearch), 350)
    return () => clearTimeout(t)
  }, [contentSearch, searchContents])

  const toggleIssue = (id: string) => {
    setSelectedIssueIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleContent = (id: string) => {
    setSelectedContentIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const totalSelected = selectedIssueIds.size + selectedContentIds.size

  const handleGenerate = async () => {
    setIsGenerating(true)
    setError(null)
    try {
      const res = await fetch('/api/reports/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: reportType,
          title: reportTitle.trim() || undefined,
          issueIds: Array.from(selectedIssueIds),
          contentIds: Array.from(selectedContentIds),
        }),
      })
      const json = await res.json()
      if (!res.ok) {
        setError(json.error ?? '보고서 생성에 실패했습니다. 잠시 후 다시 시도해주세요.')
        return
      }
      router.push(`/dashboard/reports/${json.id}`)
    } catch {
      setError('네트워크 오류가 발생했습니다. 잠시 후 다시 시도해주세요.')
    } finally {
      setIsGenerating(false)
    }
  }

  return (
    <PageContainer variant="reading">
      <BackLink
        fallbackHref="/dashboard/reports"
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      />

      <div className="mb-8">
        <h1 className="text-lg font-semibold text-foreground">새 보고서 만들기</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          이슈와 콘텐츠를 선택하면 구조 초안을 자동으로 조립합니다.
        </p>
      </div>

      {/* 단계 탭 */}
      <div className="mb-8 flex gap-1 border-b border-border">
        {(['유형', '소스 선택', '제목·생성'] as const).map((label, i) => {
          const s = (i + 1) as 1 | 2 | 3
          return (
            <button
              key={s}
              onClick={() => setStep(s)}
              className={cn(
                'px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
                step === s
                  ? 'border-brand-600 text-brand-600'
                  : 'border-transparent text-muted-foreground hover:text-foreground',
              )}
            >
              {s}. {label}
            </button>
          )
        })}
      </div>

      {/* ① 유형 선택 */}
      {step === 1 && (
        <div className="space-y-4">
          <p className="text-sm font-medium text-foreground">보고서 유형을 선택하세요</p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {REPORT_TYPES.map((t) => (
              <button
                key={t}
                onClick={() => setReportType(t)}
                className={cn(
                  'rounded-xl border p-4 text-sm font-medium text-left transition-all',
                  reportType === t
                    ? 'border-brand-600 bg-brand-600/5 text-brand-600'
                    : 'border-border text-foreground hover:border-brand-600/30 hover:bg-accent/40',
                )}
              >
                {t}
              </button>
            ))}
          </div>
          <div className="pt-4 flex justify-end">
            <button
              onClick={() => setStep(2)}
              className="rounded-lg bg-brand-solid px-5 py-2 text-sm font-medium text-white hover:bg-brand-solid-hover transition-colors"
            >
              다음 →
            </button>
          </div>
        </div>
      )}

      {/* ② 소스 선택 */}
      {step === 2 && (
        <div className="space-y-6">
          {/* 이슈 */}
          <div>
            <p className="mb-3 text-sm font-medium text-foreground">
              이슈 선택 <span className="text-muted-foreground font-normal">(복수 선택 가능)</span>
            </p>
            {issues.length === 0 ? (
              <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                아직 등록된 이슈가 없습니다.
              </div>
            ) : (
              <div className="max-h-64 overflow-y-auto rounded-xl border border-border divide-y divide-border">
                {issues.map((iss) => {
                  const checked = selectedIssueIds.has(iss.id)
                  return (
                    <button
                      key={iss.id}
                      onClick={() => toggleIssue(iss.id)}
                      className={cn(
                        'w-full flex items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-accent/40',
                        checked && 'bg-brand-600/5',
                      )}
                    >
                      {checked
                        ? <CheckSquare className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" />
                        : <Square className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground/50" />
                      }
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground leading-snug">{iss.title}</p>
                        {iss.summary && (
                          <p className="mt-0.5 text-xs text-muted-foreground line-clamp-1">{iss.summary}</p>
                        )}
                      </div>
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          {/* 콘텐츠 검색 */}
          <div>
            <p className="mb-3 text-sm font-medium text-foreground">
              콘텐츠 검색 <span className="text-muted-foreground font-normal">(선택)</span>
            </p>
            <div className="relative mb-3">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/50" />
              <input
                type="text"
                value={contentSearch}
                onChange={(e) => setContentSearch(e.target.value)}
                placeholder="콘텐츠 제목으로 검색…"
                className="w-full rounded-lg border border-border bg-background py-2 pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-brand-600/30"
              />
              {isSearching && (
                <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground/50" />
              )}
            </div>
            {contentResults.length > 0 && (
              <div className="max-h-48 overflow-y-auto rounded-xl border border-border divide-y divide-border">
                {contentResults.map((c) => {
                  const checked = selectedContentIds.has(c.id)
                  return (
                    <button
                      key={c.id}
                      onClick={() => toggleContent(c.id)}
                      className={cn(
                        'w-full flex items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-accent/40',
                        checked && 'bg-brand-600/5',
                      )}
                    >
                      {checked
                        ? <CheckSquare className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" />
                        : <Square className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground/50" />
                      }
                      <div className="min-w-0">
                        <p className="text-sm text-foreground leading-snug line-clamp-2">{c.title}</p>
                        {c.category && (
                          <p className="mt-0.5 text-xs text-muted-foreground">{c.category}</p>
                        )}
                      </div>
                    </button>
                  )
                })}
              </div>
            )}
            {selectedContentIds.size > 0 && (
              <p className="mt-2 text-xs text-muted-foreground">
                선택된 콘텐츠 {selectedContentIds.size}건
              </p>
            )}
          </div>

          <div className="flex items-center justify-between pt-2">
            <button
              onClick={() => setStep(1)}
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              ← 이전
            </button>
            <button
              onClick={() => setStep(3)}
              disabled={totalSelected === 0}
              className={cn(
                'rounded-lg px-5 py-2 text-sm font-medium transition-colors',
                totalSelected > 0
                  ? 'bg-brand-solid text-white hover:bg-brand-solid-hover'
                  : 'bg-muted text-muted-foreground cursor-not-allowed',
              )}
            >
              다음 → {totalSelected > 0 && `(${totalSelected}건 선택)`}
            </button>
          </div>
        </div>
      )}

      {/* ③ 제목·생성 */}
      {step === 3 && (
        <div className="space-y-6">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-foreground">
              보고서 제목 <span className="text-muted-foreground font-normal">(비워두면 자동 생성)</span>
            </label>
            <input
              type="text"
              value={reportTitle}
              onChange={(e) => setReportTitle(e.target.value)}
              placeholder={`${reportType} 보고서 — 오늘 날짜`}
              maxLength={200}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-brand-600/30"
            />
          </div>

          {/* 요약 */}
          <div className="rounded-xl border border-border bg-accent/30 p-4 space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">생성 요약</p>
            <div className="text-sm text-foreground space-y-1">
              <p>유형: <span className="font-medium">{reportType}</span></p>
              <p>이슈: <span className="font-medium">{selectedIssueIds.size}건</span></p>
              <p>콘텐츠: <span className="font-medium">{selectedContentIds.size}건</span></p>
            </div>
          </div>

          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <div className="flex items-center justify-between">
            <button
              onClick={() => setStep(2)}
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              ← 이전
            </button>
            <button
              onClick={handleGenerate}
              disabled={isGenerating || totalSelected === 0}
              className={cn(
                'inline-flex items-center gap-2 rounded-lg px-5 py-2 text-sm font-medium transition-colors',
                totalSelected > 0 && !isGenerating
                  ? 'bg-brand-solid text-white hover:bg-brand-solid-hover'
                  : 'bg-muted text-muted-foreground cursor-not-allowed',
              )}
            >
              {isGenerating && <Loader2 className="h-4 w-4 animate-spin" />}
              <FileText className="h-4 w-4" />
              초안 생성
            </button>
          </div>
        </div>
      )}
    </PageContainer>
  )
}

export default function NewReportPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    }>
      <WorkbenchForm />
    </Suspense>
  )
}
