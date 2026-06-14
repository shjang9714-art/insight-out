'use client'

import { useEffect, useState } from 'react'
import { Check, Loader2, Search, Trash2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { createClient } from '@/lib/supabase/client'
import {
  CONTENT_CATEGORY_LABEL,
  type ContentCategory,
  type ContentStatus,
} from '@/lib/types'
import { cn } from '@/lib/utils'

interface AdminContentRow {
  id: string
  title: string
  category: ContentCategory
  status: ContentStatus
  collected_at: string
  sources: { name: string } | null
}

const CONTENT_STATUSES: ContentStatus[] = ['published', 'pending', 'rejected']

const STATUS_STYLE: Record<ContentStatus, { label: string; className: string }> = {
  published: { label: '게시',  className: 'border-green-100 bg-green-50 text-green-700' },
  pending:   { label: '보류',  className: 'border-yellow-100 bg-yellow-50 text-yellow-700' },
  rejected:  { label: '반려',  className: 'border-red-100 bg-red-50 text-red-600' },
}

// pending → published → rejected 순서, 그 안에서 collected_at desc
const STATUS_ORDER: Record<ContentStatus, number> = { pending: 0, published: 1, rejected: 2 }

function formatKst(iso: string): string {
  return new Date(iso).toLocaleString('ko-KR', {
    timeZone: 'Asia/Seoul',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  })
}

export default function AdminContentManager() {
  const supabase = createClient()

  const [contents,        setContents]        = useState<AdminContentRow[]>([])
  const [isLoading,       setIsLoading]       = useState(true)
  const [error,           setError]           = useState<string | null>(null)
  const [pendingCount,    setPendingCount]     = useState<number | null>(null)

  // 필터 — category/search 는 클라이언트, status 는 서버쿼리
  const [category,    setCategory]    = useState('all')
  const [status,      setStatus]      = useState('all')
  const [searchTerm,  setSearchTerm]  = useState('')

  // per-row 작업
  const [workingId, setWorkingId] = useState<string | null>(null)

  // 일괄 선택
  const [selectedIds,    setSelectedIds]    = useState<Set<string>>(new Set())
  const [isBulkWorking,  setIsBulkWorking]  = useState(false)

  // ── 검토 대기 카운트 (마운트 1회) ────────────────────────────────────────
  useEffect(() => {
    supabase
      .from('contents')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending')
      .then(({ count }) => setPendingCount(count ?? 0))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── 콘텐츠 로드 (status 변경 시 재조회 — 서버필터) ────────────────────────
  useEffect(() => {
    const run = async () => {
      setIsLoading(true)
      setSelectedIds(new Set())
      setError(null)

      let query = supabase
        .from('contents')
        .select('id, title, category, status, collected_at, sources(name)')
        .order('collected_at', { ascending: false })
        .limit(100)

      if (status !== 'all') {
        query = query.eq('status', status as ContentStatus)
      }

      const { data, error: loadError } = await query
      if (loadError) {
        setError(`콘텐츠 목록을 불러오지 못했습니다: ${loadError.message}`)
      } else {
        setContents((data ?? []) as unknown as AdminContentRow[])
      }
      setIsLoading(false)
    }
    void run()
  }, [status]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── 클라이언트 필터 + 정렬 ────────────────────────────────────────────────
  const filteredContents = contents
    .filter((c) => {
      const matchesCategory = category === 'all' || c.category === category
      const matchesSearch   = c.title
        .toLocaleLowerCase('ko-KR')
        .includes(searchTerm.trim().toLocaleLowerCase('ko-KR'))
      return matchesCategory && matchesSearch
    })
    .sort((a, b) => {
      // status='all' 일 때 pending 상단. 이미 서버에서 collected_at desc 됐으므로 status 우선 정렬만.
      const diff = STATUS_ORDER[a.status] - STATUS_ORDER[b.status]
      if (diff !== 0) return diff
      return new Date(b.collected_at).getTime() - new Date(a.collected_at).getTime()
    })

  // ── per-row 상태 변경 ────────────────────────────────────────────────────
  const handleStatusChange = async (content: AdminContentRow, nextStatus: ContentStatus) => {
    setWorkingId(content.id)
    setError(null)
    const { error: updateError } = await supabase
      .from('contents')
      .update({ status: nextStatus })
      .eq('id', content.id)

    if (updateError) {
      setError(`상태 변경에 실패했습니다: ${updateError.message}`)
    } else {
      setContents((prev) => prev.map((item) =>
        item.id === content.id ? { ...item, status: nextStatus } : item
      ))
      if (nextStatus !== 'pending') {
        setPendingCount((c) => (c !== null && content.status === 'pending' ? c - 1 : c))
      }
    }
    setWorkingId(null)
  }

  const handleDelete = async (content: AdminContentRow) => {
    if (!window.confirm(`"${content.title}" 콘텐츠를 삭제하시겠습니까?`)) return
    setWorkingId(content.id)
    setError(null)
    const { error: deleteError } = await supabase
      .from('contents').delete().eq('id', content.id)

    if (deleteError) {
      setError(`콘텐츠 삭제에 실패했습니다: ${deleteError.message}`)
    } else {
      setContents((prev) => prev.filter((item) => item.id !== content.id))
      if (content.status === 'pending') {
        setPendingCount((c) => (c !== null ? c - 1 : c))
      }
    }
    setWorkingId(null)
  }

  // ── 일괄 선택 ─────────────────────────────────────────────────────────────
  const allFilteredIds = filteredContents.map((c) => c.id)
  const allSelected    = allFilteredIds.length > 0 && allFilteredIds.every((id) => selectedIds.has(id))
  const someSelected   = allFilteredIds.some((id) => selectedIds.has(id)) && !allSelected

  const toggleAll = () => {
    if (allSelected) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(allFilteredIds))
    }
  }

  const toggleRow = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) { next.delete(id) } else { next.add(id) }
      return next
    })
  }

  // ── 일괄 승인/반려 ────────────────────────────────────────────────────────
  const handleBulkStatus = async (nextStatus: ContentStatus) => {
    const ids = [...selectedIds]
    if (ids.length === 0) return
    setIsBulkWorking(true)
    setError(null)

    const { error: bulkError } = await supabase
      .from('contents')
      .update({ status: nextStatus })
      .in('id', ids)

    if (bulkError) {
      setError(`일괄 처리에 실패했습니다: ${bulkError.message}`)
    } else {
      setContents((prev) => prev.map((item) =>
        selectedIds.has(item.id) ? { ...item, status: nextStatus } : item
      ))
      setSelectedIds(new Set())
      // 일괄 처리 후 pending 카운트 서버 재조회 (로컬 추정보다 정확)
      const { count } = await supabase.from('contents').select('id', { count: 'exact', head: true }).eq('status', 'pending')
      setPendingCount(count ?? 0)
    }
    setIsBulkWorking(false)
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16 text-sm text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        콘텐츠를 불러오는 중입니다.
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="flex items-start justify-between rounded-lg border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">
          <span>{error}</span>
          <button type="button" onClick={() => setError(null)} className="ml-4 shrink-0 underline">
            닫기
          </button>
        </div>
      )}

      {/* ── 검토 대기 칩 + 필터 ── */}
      <div className="flex flex-wrap items-center gap-3">
        {pendingCount !== null && pendingCount > 0 && (
          <button
            onClick={() => setStatus('pending')}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold transition-colors',
              status === 'pending'
                ? 'border-yellow-400 bg-yellow-400 text-white'
                : 'border-yellow-300 bg-yellow-50 text-yellow-700 hover:bg-yellow-100'
            )}
          >
            ⏳ 검토 대기 {pendingCount}건
          </button>
        )}
        {pendingCount === 0 && (
          <span className="inline-flex items-center gap-1 rounded-full border border-green-100 bg-green-50 px-3 py-1 text-xs font-medium text-green-700">
            ✅ 검토 대기 없음
          </span>
        )}
      </div>

      {/* ── 검색·카테고리·상태 필터 ── */}
      <div className="grid gap-3 rounded-xl border border-border bg-card p-4 md:grid-cols-[1fr_180px_180px]">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="제목 검색"
            className="pl-9"
          />
        </div>
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="카테고리" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">전체 카테고리</SelectItem>
            {Object.entries(CONTENT_CATEGORY_LABEL).map(([value, label]) => (
              <SelectItem key={value} value={value}>{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="상태" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">전체 상태</SelectItem>
            {CONTENT_STATUSES.map((value) => (
              <SelectItem key={value} value={value}>{STATUS_STYLE[value].label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* ── 일괄 작업 바 ── */}
      {selectedIds.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-accent/60 px-4 py-2.5 text-sm">
          <span className="font-medium text-foreground">{selectedIds.size}건 선택</span>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={isBulkWorking}
              onClick={() => handleBulkStatus('published')}
              className="text-green-700"
            >
              {isBulkWorking ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
              일괄 승인
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={isBulkWorking}
              onClick={() => handleBulkStatus('rejected')}
              className="text-red-600"
            >
              {isBulkWorking ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />}
              일괄 반려
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={isBulkWorking}
              onClick={() => setSelectedIds(new Set())}
            >
              선택 해제
            </Button>
          </div>
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        {filteredContents.length}건 표시 (최근 100건 기준{status !== 'all' ? ` · ${STATUS_STYLE[status as ContentStatus]?.label} 필터` : ''})
      </p>

      {filteredContents.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
          조건에 맞는 콘텐츠가 없습니다.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <table className="w-full min-w-[960px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-border bg-muted text-left text-xs font-semibold text-muted-foreground">
                <th className="px-3 py-3">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    ref={(el) => { if (el) el.indeterminate = someSelected }}
                    onChange={toggleAll}
                    className="h-4 w-4 rounded border-border accent-[--color-brand-600]"
                    aria-label="전체 선택"
                  />
                </th>
                <th className="px-4 py-3">제목</th>
                <th className="px-4 py-3">카테고리</th>
                <th className="px-4 py-3">소스</th>
                <th className="px-4 py-3">상태</th>
                <th className="px-4 py-3">수집일 (KST)</th>
                <th className="px-4 py-3 text-right">관리</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filteredContents.map((content) => {
                const isWorking    = workingId === content.id
                const isSelected   = selectedIds.has(content.id)
                const statusStyle  = STATUS_STYLE[content.status]
                return (
                  <tr
                    key={content.id}
                    className={cn(
                      'hover:bg-accent/50 transition-colors',
                      isSelected && 'bg-accent/30'
                    )}
                  >
                    <td className="px-3 py-3">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleRow(content.id)}
                        className="h-4 w-4 rounded border-border accent-[--color-brand-600]"
                        aria-label={`${content.title} 선택`}
                      />
                    </td>
                    <td className="max-w-md px-4 py-3 font-medium text-foreground">
                      <span className="line-clamp-2">{content.title}</span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                      {CONTENT_CATEGORY_LABEL[content.category]}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                      {content.sources?.name ?? '—'}
                    </td>
                    <td className="px-4 py-3">
                      <span className={cn(
                        'inline-flex rounded-full border px-2 py-0.5 text-xs font-medium',
                        statusStyle.className
                      )}>
                        {statusStyle.label}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-xs text-muted-foreground">
                      {formatKst(content.collected_at)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1.5">
                        {content.status !== 'published' && (
                          <Button
                            type="button" size="sm" variant="outline"
                            disabled={isWorking || isBulkWorking}
                            onClick={() => handleStatusChange(content, 'published')}
                            className="text-green-700"
                          >
                            <Check className="h-3.5 w-3.5" />
                            승인
                          </Button>
                        )}
                        {content.status !== 'rejected' && (
                          <Button
                            type="button" size="sm" variant="outline"
                            disabled={isWorking || isBulkWorking}
                            onClick={() => handleStatusChange(content, 'rejected')}
                            className="text-red-600"
                          >
                            <X className="h-3.5 w-3.5" />
                            반려
                          </Button>
                        )}
                        <Button
                          type="button" size="icon-sm" variant="ghost"
                          disabled={isWorking || isBulkWorking}
                          onClick={() => handleDelete(content)}
                          aria-label={`${content.title} 삭제`}
                          className="text-muted-foreground/40 hover:text-red-600"
                        >
                          {isWorking
                            ? <Loader2 className="h-4 w-4 animate-spin" />
                            : <Trash2 className="h-4 w-4" />
                          }
                        </Button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
