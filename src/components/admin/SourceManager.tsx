'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import {
  CheckCircle2,
  FileUp,
  Loader2,
  Plus,
  Pencil,
  Trash2,
  X,
  XCircle,
} from 'lucide-react'
import type { SourceType } from '@/lib/types'
import { SourceImportDialog } from '@/components/admin/SourceImportDialog'
import type {
  CrawlJob,
  CrawlProgress,
} from '@/lib/crawler/progress'

// ─── 상수 ─────────────────────────────────────────────────────────────────────

const SOURCE_TYPE_LABELS: Record<SourceType, string> = {
  news_site:        '뉴스',
  report_publisher: '리포트 발행처',
  opinion_channel:  '오피니언',
  newsletter:       '뉴스레터',
  youtube_channel:  '유튜브',
}

const SOURCE_TYPES: SourceType[] = [
  'news_site', 'report_publisher', 'opinion_channel', 'newsletter', 'youtube_channel',
]
const CRAWL_JOB_STORAGE_KEY = 'insight-out:admin-crawl-job'

// ─── 타입 ─────────────────────────────────────────────────────────────────────

interface SourceRow {
  id: string
  name: string
  type: SourceType
  url: string | null
  rss_url: string | null
  is_active: boolean
  crawl_interval_minutes: number | null
  last_crawled_at: string | null
  order: number
}

interface SourceForm {
  name: string
  type: SourceType
  url: string
  rss_url: string
  crawl_interval_minutes: string
  is_active: boolean
}

const FORM_INIT: SourceForm = {
  name:                   '',
  type:                   'news_site',
  url:                    '',
  rss_url:                '',
  crawl_interval_minutes: '720',
  is_active:              true,
}

// ─── 헬퍼 ─────────────────────────────────────────────────────────────────────

function formatKst(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('ko-KR', {
    timeZone: 'Asia/Seoul',
    year:     'numeric',
    month:    '2-digit',
    day:      '2-digit',
    hour:     '2-digit',
    minute:   '2-digit',
  })
}

function needsRssUrl(type: SourceType): boolean {
  return type === 'news_site' || type === 'youtube_channel'
}

// ─── 컴포넌트 ─────────────────────────────────────────────────────────────────

export default function SourceManager() {
  const supabase = createClient()

  const [sources,   setSources]   = useState<SourceRow[]>([])
  const [isLoading, setIsLoading] = useState(true)       // 초기값 true — useEffect 에서 setIsLoading(true) 호출 불필요
  const [error,     setError]     = useState<string | null>(null)

  // 추가/수정 폼 상태 (editingId=null → 추가, string → 수정)
  const [showForm,   setShowForm]   = useState(false)
  const [editingId,  setEditingId]  = useState<string | null>(null)
  const [form,       setForm]       = useState<SourceForm>(FORM_INIT)
  const [formError,  setFormError]  = useState<string | null>(null)
  const [isSaving,   setIsSaving]   = useState(false)
  const [showImport, setShowImport] = useState(false)

  // 유형 필터 상태 (§A)
  const [selectedTypes, setSelectedTypes] = useState<Set<SourceType>>(new Set())

  // ── 목록 로드 ─────────────────────────────────────────────────────────────

  async function loadSources() {
    setIsLoading(true)
    const { data, error: err } = await supabase
      .from('sources')
      .select('id, name, type, url, rss_url, is_active, crawl_interval_minutes, last_crawled_at, order')
      .order('order', { ascending: true })
      .order('name',  { ascending: true })
    if (err) {
      setError(`소스 목록 로드 실패: ${err.message}`)
    } else {
      setSources((data ?? []) as SourceRow[])
    }
    setIsLoading(false)
  }

  useEffect(() => {
    const init = async () => {
      const { data, error: err } = await supabase
        .from('sources')
        .select('id, name, type, url, rss_url, is_active, crawl_interval_minutes, last_crawled_at, order')
        .order('order', { ascending: true })
        .order('name',  { ascending: true })
      if (err) {
        setError(`소스 목록 로드 실패: ${err.message}`)
      } else {
        setSources((data ?? []) as SourceRow[])
      }
      setIsLoading(false)
    }
    init()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── 폼 열기/닫기 ──────────────────────────────────────────────────────────

  function openAdd() {
    setForm(FORM_INIT)
    setEditingId(null)
    setFormError(null)
    setShowForm(true)
  }

  function openEdit(src: SourceRow) {
    setForm({
      name:                   src.name,
      type:                   src.type,
      url:                    src.url  ?? '',
      rss_url:                src.rss_url ?? '',
      crawl_interval_minutes: String(src.crawl_interval_minutes ?? 720),
      is_active:              src.is_active,
    })
    setEditingId(src.id)
    setFormError(null)
    setShowForm(true)
  }

  function closeForm() {
    setShowForm(false)
    setEditingId(null)
    setFormError(null)
  }

  // ── 폼 저장 ───────────────────────────────────────────────────────────────

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setFormError(null)

    if (!form.name.trim()) {
      setFormError('이름을 입력해주세요.')
      return
    }

    setIsSaving(true)
    try {
      const payload = {
        name:                   form.name.trim(),
        type:                   form.type,
        url:                    form.url.trim()     || null,
        rss_url:                form.rss_url.trim() || null,
        crawl_interval_minutes: form.crawl_interval_minutes
          ? parseInt(form.crawl_interval_minutes, 10)
          : null,
        is_active: form.is_active,
      }

      if (editingId) {
        const { error: err } = await supabase
          .from('sources')
          .update(payload)
          .eq('id', editingId)
        if (err) throw new Error(`수정 실패: ${err.message}`)
      } else {
        const { error: err } = await supabase
          .from('sources')
          .insert(payload)
        if (err) throw new Error(`추가 실패: ${err.message}`)
      }

      closeForm()
      await loadSources()
    } catch (err) {
      setFormError(err instanceof Error ? err.message : '저장 중 오류가 발생했습니다.')
    } finally {
      setIsSaving(false)
    }
  }

  // ── 활성 토글 (낙관적 갱신) ───────────────────────────────────────────────

  const handleToggle = async (src: SourceRow) => {
    const next = !src.is_active
    setSources(prev => prev.map(s => s.id === src.id ? { ...s, is_active: next } : s))
    const { error: err } = await supabase
      .from('sources')
      .update({ is_active: next })
      .eq('id', src.id)
    if (err) {
      // 실패 시 롤백
      setSources(prev => prev.map(s => s.id === src.id ? { ...s, is_active: src.is_active } : s))
      setError(`활성 상태 변경 실패: ${err.message}`)
    }
  }

  // ── 삭제 ──────────────────────────────────────────────────────────────────

  const handleDelete = async (src: SourceRow) => {
    const confirmed = window.confirm(
      `"${src.name}"을(를) 삭제하시겠습니까?\n\n` +
      `⚠️ 단순 수집 중단이 목적이라면 비활성화를 권장합니다.\n` +
      `삭제해도 기존 콘텐츠·크롤링 로그는 보존됩니다.`
    )
    if (!confirmed) return

    const { error: err } = await supabase
      .from('sources')
      .delete()
      .eq('id', src.id)
    if (err) {
      setError(`삭제 실패: ${err.message}`)
    } else {
      setSources(prev => prev.filter(s => s.id !== src.id))
    }
  }

  // ── RSS 경고 ──────────────────────────────────────────────────────────────

  const rssWarning = needsRssUrl(form.type) && !form.rss_url.trim()

  // ── 유형 필터 (§A) ────────────────────────────────────────────────────────

  const toggleTypeFilter = (type: SourceType) => {
    setSelectedTypes(prev => {
      const next = new Set(prev)
      if (next.has(type)) {
        next.delete(type)
      } else {
        next.add(type)
      }
      return next
    })
  }

  const clearTypeFilter = () => setSelectedTypes(new Set())

  // 유형별 개수 계산
  const typeCounts = SOURCE_TYPES.reduce((acc, type) => {
    acc[type] = sources.filter(s => s.type === type).length
    return acc
  }, {} as Record<SourceType, number>)

  // 필터링된 소스 목록
  const filteredSources = selectedTypes.size === 0
    ? sources
    : sources.filter(s => selectedTypes.has(s.type))

  // ── 크롤링 트리거 (§B) ────────────────────────────────────────────────────

  const [isStartingCrawl, setIsStartingCrawl] = useState(false)
  const [crawlJob, setCrawlJob] = useState<CrawlJob | null>(null)
  const [crawlProgress, setCrawlProgress] = useState<CrawlProgress | null>(null)

  useEffect(() => {
    const savedJob = window.localStorage.getItem(CRAWL_JOB_STORAGE_KEY)
    if (!savedJob) return

    let restoreTimer: number | null = null
    try {
      const parsedJob = JSON.parse(savedJob) as CrawlJob
      restoreTimer = window.setTimeout(() => setCrawlJob(parsedJob), 0)
    } catch {
      window.localStorage.removeItem(CRAWL_JOB_STORAGE_KEY)
    }

    return () => {
      if (restoreTimer !== null) window.clearTimeout(restoreTimer)
    }
  }, [])

  useEffect(() => {
    if (!crawlJob || (
      crawlProgress
      && crawlProgress.status !== 'running'
    )) return

    let cancelled = false

    const pollProgress = async () => {
      try {
        const params = new URLSearchParams({
          startedAt: crawlJob.startedAt,
          sourcesTotal: String(crawlJob.sourcesTotal),
        })
        const response = await fetch(`/api/admin/crawl-now?${params}`)
        const data = await response.json()
        if (!response.ok) {
          throw new Error(data.error ?? '수집 진행 상태 조회 실패')
        }
        if (cancelled) return

        const progress = data as CrawlProgress
        setCrawlProgress(progress)

        if (progress.status !== 'running') {
          window.localStorage.removeItem(CRAWL_JOB_STORAGE_KEY)
          await loadSources()
        }
      } catch (pollError) {
        if (!cancelled) {
          setCrawlProgress({
            status: 'failed',
            startedAt: crawlJob.startedAt,
            sourcesTotal: crawlJob.sourcesTotal,
            completed: 0,
            success: 0,
            partial: 0,
            failed: 0,
            fetched: 0,
            inserted: 0,
            duplicates: 0,
            held: 0,
            latestSource: null,
            message: pollError instanceof Error
              ? pollError.message
              : '수집 진행 상태를 확인하지 못했습니다.',
          })
          window.localStorage.removeItem(CRAWL_JOB_STORAGE_KEY)
        }
      }
    }

    void pollProgress()
    const intervalId = window.setInterval(() => {
      if (crawlProgress?.status === 'running' || !crawlProgress) {
        void pollProgress()
      }
    }, 1500)

    return () => {
      cancelled = true
      window.clearInterval(intervalId)
    }
  }, [crawlJob, crawlProgress?.status]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleCrawlNow = async () => {
    if (!window.confirm('모든 활성 소스를 지금 수집하시겠습니까?')) return

    setIsStartingCrawl(true)
    setCrawlProgress(null)
    setError(null)
    try {
      const res = await fetch('/api/admin/crawl-now', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? '수집 요청 실패')

      const job = data as CrawlJob
      window.localStorage.setItem(CRAWL_JOB_STORAGE_KEY, JSON.stringify(job))
      setCrawlJob(job)
    } catch (err) {
      setError(err instanceof Error ? err.message : '수집 중 오류가 발생했습니다.')
    } finally {
      setIsStartingCrawl(false)
    }
  }

  const closeCrawlProgress = () => {
    if (crawlProgress?.status === 'running') return
    setCrawlProgress(null)
    setCrawlJob(null)
  }

  const progressPercent = crawlProgress?.sourcesTotal
    ? Math.round(
        (crawlProgress.completed / crawlProgress.sourcesTotal) * 100
      )
    : crawlProgress?.status === 'completed'
      ? 100
      : 0

  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* 전역 오류 */}
      {error && (
        <div className="flex items-start justify-between rounded-lg border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">
          <span>{error}</span>
          <button
            onClick={() => setError(null)}
            className="ml-4 shrink-0 text-red-400 underline hover:text-red-600"
          >
            닫기
          </button>
        </div>
      )}

      {/* ── 추가/수정 폼 ── */}
      {showForm && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold text-foreground">
              {editingId ? '소스 수정' : '새 소스 추가'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSave} className="space-y-4">
              {formError && (
                <div className="rounded-lg border border-red-100 bg-red-50 px-4 py-2 text-sm text-red-600">
                  {formError}
                </div>
              )}

              {/* 이름·유형 */}
              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="src-name">
                    이름 <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="src-name"
                    value={form.name}
                    onChange={(e) => setForm(p => ({ ...p, name: e.target.value }))}
                    placeholder="예: 전자신문"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="src-type">
                    유형 <span className="text-red-500">*</span>
                  </Label>
                  <Select
                    value={form.type}
                    onValueChange={(v) => setForm(p => ({ ...p, type: v as SourceType }))}
                  >
                    <SelectTrigger id="src-type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SOURCE_TYPES.map(t => (
                        <SelectItem key={t} value={t}>
                          {SOURCE_TYPE_LABELS[t]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {!needsRssUrl(form.type) && (
                    <p className="text-[11px] text-amber-600">
                      현재 이 유형의 자동 수집 어댑터는 준비 중입니다.
                    </p>
                  )}
                </div>
              </div>

              {/* 사이트 URL·RSS URL */}
              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="src-url">
                    사이트 URL{' '}
                    <span className="text-xs font-normal text-muted-foreground">(선택)</span>
                  </Label>
                  <Input
                    id="src-url"
                    type="url"
                    value={form.url}
                    onChange={(e) => setForm(p => ({ ...p, url: e.target.value }))}
                    placeholder="https://..."
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="src-rss">
                    RSS URL{' '}
                    {needsRssUrl(form.type) ? (
                      <span className="text-[11px] text-red-500">수집에 필요</span>
                    ) : (
                      <span className="text-xs font-normal text-muted-foreground">(선택)</span>
                    )}
                  </Label>
                  <Input
                    id="src-rss"
                    type="url"
                    value={form.rss_url}
                    onChange={(e) => setForm(p => ({ ...p, rss_url: e.target.value }))}
                    placeholder="https://.../rss"
                    className={cn(rssWarning && 'border-amber-400 focus-visible:ring-amber-200')}
                  />
                  {rssWarning && (
                    <p className="text-[11px] text-amber-600">
                      RSS URL이 없으면 자동 수집이 되지 않습니다.
                    </p>
                  )}
                </div>
              </div>

              {/* 수집 주기·활성 */}
              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="src-interval">
                    수집 주기(분){' '}
                    <span className="text-xs font-normal text-muted-foreground">기본 720 = 12시간</span>
                  </Label>
                  <Input
                    id="src-interval"
                    type="number"
                    min={30}
                    value={form.crawl_interval_minutes}
                    onChange={(e) => setForm(p => ({ ...p, crawl_interval_minutes: e.target.value }))}
                    placeholder="720"
                  />
                </div>

                <div className="flex items-end pb-0.5">
                  <label className="flex cursor-pointer items-center gap-2">
                    <input
                      type="checkbox"
                      checked={form.is_active}
                      onChange={(e) => setForm(p => ({ ...p, is_active: e.target.checked }))}
                      className="h-4 w-4 rounded border-border accent-[--color-brand-600]"
                    />
                    <span className="text-sm text-foreground">활성화 (자동 수집 대상)</span>
                  </label>
                </div>
              </div>

              {/* 버튼 */}
              <div className="flex justify-end gap-2 pt-1">
                <Button type="button" variant="outline" onClick={closeForm}>
                  취소
                </Button>
                <Button type="submit" disabled={isSaving}>
                  {isSaving ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      저장 중...
                    </>
                  ) : (
                    editingId ? '수정 저장' : '소스 추가'
                  )}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* ── 유형 필터 칩 (§A) ── */}
      {!showForm && (
        <div className="rounded-lg border border-border bg-card px-4 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium text-foreground">유형:</span>
            <button
              onClick={clearTypeFilter}
              className={cn(
                'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                selectedTypes.size === 0
                  ? 'border-brand-600 bg-brand-600 text-white'
                  : 'border-border bg-card text-foreground hover:border-border hover:bg-accent/50'
              )}
            >
              전체 {sources.length}
            </button>
            {SOURCE_TYPES.map(type => {
              const count = typeCounts[type]
              const selected = selectedTypes.has(type)
              return (
                <button
                  key={type}
                  onClick={() => toggleTypeFilter(type)}
                  className={cn(
                    'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                    selected
                      ? 'border-brand-600 bg-brand-600 text-white'
                      : 'border-border bg-card text-foreground hover:border-border hover:bg-accent/50'
                  )}
                >
                  {SOURCE_TYPE_LABELS[type]} {count}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* ── 목록 헤더 ── */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {isLoading ? '불러오는 중…' : `총 ${sources.length}개 소스${selectedTypes.size > 0 ? ` (${filteredSources.length}개 표시)` : ''}`}
        </p>
        <div className="flex items-center gap-2">
          {!showForm && (
            <>
              <Button
                size="sm"
                variant="outline"
                onClick={handleCrawlNow}
                disabled={isStartingCrawl || crawlProgress?.status === 'running'}
              >
                {isStartingCrawl ? (
                  <>
                    <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                    시작 중...
                  </>
                ) : (
                  '지금 수집'
                )}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setShowImport(true)}
              >
                <FileUp className="mr-1.5 h-4 w-4" />
                대량 등록
              </Button>
              <Button size="sm" onClick={openAdd}>
                <Plus className="mr-1.5 h-4 w-4" />
                소스 추가
              </Button>
            </>
          )}
        </div>
      </div>

      {/* ── 목록 테이블 ── */}
      {isLoading ? (
        <div className="flex items-center justify-center py-16 text-sm text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          소스 목록 로드 중...
        </div>
      ) : sources.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border py-16 text-center text-sm text-muted-foreground">
          등록된 소스가 없습니다. 소스 추가 버튼으로 첫 번째 소스를 등록해보세요.
        </div>
      ) : filteredSources.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border py-16 text-center text-sm text-muted-foreground">
          선택한 유형의 소스가 없습니다.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <table className="w-full min-w-[700px] text-sm">
            <thead>
              <tr className="border-b border-border bg-muted text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-3">이름</th>
                <th className="px-4 py-3">유형</th>
                <th className="px-4 py-3 max-w-[200px]">RSS URL</th>
                <th className="px-4 py-3">활성</th>
                <th className="px-4 py-3">주기(분)</th>
                <th className="px-4 py-3 whitespace-nowrap">마지막 수집 (KST)</th>
                <th className="px-4 py-3 text-right">작업</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filteredSources.map(src => (
                <tr key={src.id} className="hover:bg-accent/50 transition-colors">
                  <td className="px-4 py-3 font-medium text-foreground">{src.name}</td>
                  <td className="px-4 py-3">
                    <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs text-muted-foreground">
                      {SOURCE_TYPE_LABELS[src.type]}
                    </span>
                  </td>
                  <td className="px-4 py-3 max-w-[200px]">
                    {src.rss_url ? (
                      <span
                        className="block max-w-[180px] truncate text-xs text-muted-foreground"
                        title={src.rss_url}
                      >
                        {src.rss_url}
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground/40">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => handleToggle(src)}
                      className={cn(
                        'rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors',
                        src.is_active
                          ? 'bg-green-50 text-green-700 hover:bg-green-100'
                          : 'bg-muted text-muted-foreground hover:bg-accent'
                      )}
                    >
                      {src.is_active ? '활성' : '비활성'}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {src.crawl_interval_minutes ?? '—'}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-xs text-muted-foreground">
                    {formatKst(src.last_crawled_at)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-0.5">
                      <button
                        onClick={() => openEdit(src)}
                        className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                        title="수정"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => handleDelete(src)}
                        className="rounded p-1.5 text-muted-foreground/40 transition-colors hover:bg-red-50 hover:text-red-600"
                        title="삭제"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <SourceImportDialog
        open={showImport}
        onClose={() => setShowImport(false)}
        onImported={loadSources}
      />

      {crawlJob && crawlProgress && (
        <div className="fixed bottom-5 right-5 z-50 w-[calc(100%-2.5rem)] max-w-sm rounded-xl border border-border bg-card p-5 shadow-xl">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2">
              {crawlProgress.status === 'running' ? (
                <Loader2 className="size-5 animate-spin text-brand-600" />
              ) : crawlProgress.status === 'completed' ? (
                <CheckCircle2 className="size-5 text-green-600" />
              ) : (
                <XCircle className="size-5 text-red-600" />
              )}
              <div>
                <p className="text-sm font-semibold text-foreground">
                  {crawlProgress.status === 'running'
                    ? '콘텐츠 수집 중'
                    : crawlProgress.status === 'completed'
                      ? '콘텐츠 수집 완료'
                      : '콘텐츠 수집 확인 필요'}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {crawlProgress.completed}/{crawlProgress.sourcesTotal}개 소스 처리
                </p>
              </div>
            </div>
            {crawlProgress.status !== 'running' && (
              <button
                type="button"
                onClick={closeCrawlProgress}
                className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                aria-label="수집 현황 닫기"
              >
                <X className="size-4" />
              </button>
            )}
          </div>

          <div className="mt-4 h-2 overflow-hidden rounded-full bg-muted">
            <div
              className={cn(
                'h-full rounded-full transition-[width] duration-500',
                crawlProgress.status === 'failed'
                  ? 'bg-red-500'
                  : 'bg-brand-600'
              )}
              style={{ width: `${progressPercent}%` }}
            />
          </div>

          <div className="mt-3 grid grid-cols-4 gap-2 text-center">
            <div className="rounded-lg bg-muted px-2 py-2">
              <p className="text-[10px] text-muted-foreground">가져옴</p>
              <p className="text-xs font-semibold text-foreground">
                {crawlProgress.fetched}
              </p>
            </div>
            <div className="rounded-lg bg-green-50 px-2 py-2">
              <p className="text-[10px] text-green-600">신규</p>
              <p className="text-xs font-semibold text-green-700">
                {crawlProgress.inserted}
              </p>
            </div>
            <div className="rounded-lg bg-muted px-2 py-2">
              <p className="text-[10px] text-muted-foreground">중복</p>
              <p className="text-xs font-semibold text-foreground">
                {crawlProgress.duplicates}
              </p>
            </div>
            <div className="rounded-lg bg-red-50 px-2 py-2">
              <p className="text-[10px] text-red-600">실패</p>
              <p className="text-xs font-semibold text-red-700">
                {crawlProgress.failed}
              </p>
            </div>
          </div>

          {crawlProgress.status === 'running' && (
            <p className="mt-3 truncate text-xs text-muted-foreground">
              {crawlProgress.latestSource
                ? `최근 완료: ${crawlProgress.latestSource}`
                : '활성 소스 연결을 준비하고 있습니다.'}
            </p>
          )}
          {crawlProgress.message && (
            <p className="mt-3 text-xs leading-relaxed text-red-600">
              {crawlProgress.message}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
