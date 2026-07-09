'use client'

import { useEffect, useState } from 'react'
import { Loader2, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import AdminErrorBox from '@/components/admin/ui/AdminErrorBox'
import KeyInsightCard, { type KeyInsightEditableFields } from '@/components/key-insights/KeyInsightCard'
import type { KeyInsightRow } from '@/lib/key-insights/types'

interface ListResponse {
  weeks: string[]
  weekOf: string | null
  summary: { total: number; needsReview: number; published: number; featured: number } | null
  cards: KeyInsightRow[]
  error?: string
}

export default function KeyInsightsManager() {
  const [weeks, setWeeks] = useState<string[]>([])
  const [weekOf, setWeekOf] = useState<string | null>(null)
  const [summary, setSummary] = useState<ListResponse['summary']>(null)
  const [cards, setCards] = useState<KeyInsightRow[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  async function fetchList(targetWeek?: string): Promise<ListResponse> {
    const qs = targetWeek ? `?week_of=${encodeURIComponent(targetWeek)}` : ''
    const res = await fetch(`/api/admin/key-insights${qs}`, { cache: 'no-store' })
    const data = (await res.json()) as ListResponse
    if (!res.ok) throw new Error(data.error ?? '목록을 불러오지 못했습니다.')
    return data
  }

  async function load(targetWeek?: string) {
    setIsLoading(true)
    setError(null)
    try {
      const data = await fetchList(targetWeek)
      setWeeks(data.weeks)
      setWeekOf(data.weekOf)
      setSummary(data.summary)
      setCards(data.cards)
    } catch (err) {
      setError(err instanceof Error ? err.message : '목록을 불러오지 못했습니다.')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    let isActive = true

    async function init() {
      try {
        const data = await fetchList()
        if (!isActive) return
        setWeeks(data.weeks)
        setWeekOf(data.weekOf)
        setSummary(data.summary)
        setCards(data.cards)
      } catch (err) {
        if (isActive) setError(err instanceof Error ? err.message : '목록을 불러오지 못했습니다.')
      } finally {
        if (isActive) setIsLoading(false)
      }
    }

    void init()
    return () => { isActive = false }
  }, [])

  function handleWeekChange(next: string) {
    setWeekOf(next)
    void load(next)
  }

  async function patchCard(id: string, patch: Record<string, unknown>) {
    const res = await fetch(`/api/admin/key-insights/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    })
    const data = (await res.json()) as { ok?: boolean; card?: KeyInsightRow; error?: string }
    if (!res.ok || !data.card) throw new Error(data.error ?? '저장에 실패했습니다.')
    setCards((prev) => prev.map((c) => (c.id === id ? data.card! : c)))
    setSummary((prev) => {
      if (!prev) return prev
      const nextCards = cards.map((c) => (c.id === id ? data.card! : c))
      return {
        total: nextCards.length,
        needsReview: nextCards.filter((c) => c.status === 'needs_review' || c.status === 'draft').length,
        published: nextCards.filter((c) => c.status === 'published').length,
        featured: nextCards.filter((c) => c.is_featured).length,
      }
    })
  }

  async function handleSaveFields(id: string, patch: Partial<KeyInsightEditableFields>) {
    setBusyId(id)
    try {
      await patchCard(id, patch)
    } finally {
      setBusyId(null)
    }
  }

  async function handleToggle(id: string, field: 'is_new' | 'is_featured' | 'needs_verify', value: boolean) {
    setBusyId(id)
    try {
      await patchCard(id, { [field]: value })
    } catch (err) {
      setError(err instanceof Error ? err.message : '변경에 실패했습니다.')
    } finally {
      setBusyId(null)
    }
  }

  async function handleStatusChange(id: string, status: 'published' | 'rejected' | 'needs_review') {
    setBusyId(id)
    try {
      await patchCard(id, { status })
    } finally {
      setBusyId(null)
    }
  }

  function handleMove(id: string, direction: 'up' | 'down') {
    const idx = cards.findIndex((c) => c.id === id)
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1
    if (idx < 0 || swapIdx < 0 || swapIdx >= cards.length) return

    const a = cards[idx]
    const b = cards[swapIdx]
    const aOrder = a.display_order ?? idx + 1
    const bOrder = b.display_order ?? swapIdx + 1

    setCards((prev) => {
      const next = [...prev]
      next[idx] = { ...b, display_order: aOrder }
      next[swapIdx] = { ...a, display_order: bOrder }
      return next
    })

    void patchCard(a.id, { display_order: bOrder })
    void patchCard(b.id, { display_order: aOrder })
  }

  if (isLoading && cards.length === 0) {
    return (
      <div className="flex min-h-40 items-center justify-center rounded-xl border border-border bg-card">
        <Loader2 className="h-5 w-5 animate-spin text-brand-600" />
        <span className="ml-2 text-sm text-muted-foreground">불러오는 중입니다.</span>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {error && <AdminErrorBox onDismiss={() => setError(null)}>{error}</AdminErrorBox>}

      {/* 주차 선택 + 요약 */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card px-5 py-4">
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">주차</span>
          {weeks.length > 0 ? (
            <Select value={weekOf ?? undefined} onValueChange={handleWeekChange} disabled={isLoading}>
              <SelectTrigger className="h-8 w-44 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {weeks.map((w) => (
                  <SelectItem key={w} value={w}>{w}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <span className="text-sm text-muted-foreground">배치 없음</span>
          )}
          <Button variant="outline" size="sm" disabled={isLoading} onClick={() => void load(weekOf ?? undefined)}>
            <RefreshCw className={cn('h-3.5 w-3.5', isLoading && 'animate-spin')} />
            새로고침
          </Button>
        </div>

        {summary && (
          <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            <span>총 <span className="font-medium text-foreground tabular-nums">{summary.total}</span>건</span>
            <span>검수 대기 <span className="font-medium text-risk tabular-nums">{summary.needsReview}</span>건</span>
            <span>게시 <span className="font-medium text-positive tabular-nums">{summary.published}</span>건</span>
            <span>PICK 지정 <span className="font-medium text-foreground tabular-nums">{summary.featured}</span>건</span>
          </div>
        )}
      </div>

      {/* 카드 목록 */}
      {cards.length === 0 ? (
        <div className="rounded-lg border border-dashed p-10 text-center text-muted-foreground">
          이번 주차에 생성된 핵심 Insight 카드가 없습니다.
        </div>
      ) : (
        <div className="space-y-3">
          {cards.map((card, idx) => (
            <KeyInsightCard
              key={card.id}
              card={card}
              mode="review"
              isBusy={busyId === card.id}
              onSaveFields={(patch) => handleSaveFields(card.id, patch)}
              onToggle={(field, value) => handleToggle(card.id, field, value)}
              onStatusChange={(status) => handleStatusChange(card.id, status)}
              onMove={(direction) => handleMove(card.id, direction)}
              canMoveUp={idx > 0}
              canMoveDown={idx < cards.length - 1}
            />
          ))}
        </div>
      )}
    </div>
  )
}
