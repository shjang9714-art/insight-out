'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import KeyInsightCard from '@/components/key-insights/KeyInsightCard'
import type { KeyInsightRow } from '@/lib/key-insights/types'

interface KeyInsightArchiveProps {
  initialWeeks: string[]
  initialWeekOf: string | null
  initialCards: KeyInsightRow[]
}

function weekLabel(weekOf: string): string {
  const d = new Date(weekOf + 'T00:00:00')
  const end = new Date(d)
  end.setDate(end.getDate() + 6)
  const fmt = (x: Date) => `${x.getMonth() + 1}/${x.getDate()}`
  return `${fmt(d)} ~ ${fmt(end)}`
}

export default function KeyInsightArchive({ initialWeeks, initialWeekOf, initialCards }: KeyInsightArchiveProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const [weeks, setWeeks] = useState(initialWeeks)
  const [weekOf, setWeekOf] = useState(initialWeekOf)
  const [cards, setCards] = useState(initialCards)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const highlightedRef = useRef<HTMLDivElement | null>(null)
  const scrolledForCard = useRef<string | null>(null)

  const requestedWeek = searchParams.get('week')
  const highlightCardId = searchParams.get('card')

  // URL 의 ?week= 이 현재 표시 중인 주차와 다르면(딥링크 진입 포함) 그 주차를 불러온다.
  useEffect(() => {
    if (!requestedWeek || requestedWeek === weekOf) return
    let isActive = true

    async function loadWeek() {
      setIsLoading(true)
      setError(null)
      try {
        const res = await fetch(`/api/key-insights?week_of=${encodeURIComponent(requestedWeek!)}`, { cache: 'no-store' })
        const data = (await res.json()) as { weeks: string[]; weekOf: string | null; cards: KeyInsightRow[]; error?: string }
        if (!res.ok) throw new Error(data.error ?? '불러오지 못했습니다.')
        if (!isActive) return
        setWeeks(data.weeks)
        setWeekOf(data.weekOf)
        setCards(data.cards)
      } catch (err) {
        if (isActive) setError(err instanceof Error ? err.message : '불러오지 못했습니다.')
      } finally {
        if (isActive) setIsLoading(false)
      }
    }

    void loadWeek()
    return () => { isActive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestedWeek])

  // 딥링크(?card=) 진입 시 해당 카드로 스크롤 + 하이라이트
  useEffect(() => {
    if (!highlightCardId || isLoading) return
    if (scrolledForCard.current === highlightCardId) return
    if (!cards.some((c) => c.id === highlightCardId)) return
    scrolledForCard.current = highlightCardId
    highlightedRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [highlightCardId, isLoading, cards])

  async function handleWeekChange(next: string) {
    setWeekOf(next)
    const params = new URLSearchParams(searchParams.toString())
    params.set('week', next)
    params.delete('card')
    router.replace(`${pathname}?${params.toString()}`, { scroll: false })

    setIsLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/key-insights?week_of=${encodeURIComponent(next)}`, { cache: 'no-store' })
      const data = (await res.json()) as { weeks: string[]; weekOf: string | null; cards: KeyInsightRow[]; error?: string }
      if (!res.ok) throw new Error(data.error ?? '불러오지 못했습니다.')
      setWeeks(data.weeks)
      setWeekOf(data.weekOf)
      setCards(data.cards)
    } catch (err) {
      setError(err instanceof Error ? err.message : '불러오지 못했습니다.')
    } finally {
      setIsLoading(false)
    }
  }

  if (weeks.length === 0) {
    return (
      <div className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">
        이번 주 핵심 Insight 준비 중입니다.
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">주차</span>
          <Select value={weekOf ?? undefined} onValueChange={(v) => void handleWeekChange(v)} disabled={isLoading}>
            <SelectTrigger className="h-8 w-40 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {weeks.map((w) => (
                <SelectItem key={w} value={w}>{weekLabel(w)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {isLoading && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
        </div>
      </div>

      {error && (
        <p className="text-sm text-destructive">{error}</p>
      )}

      {cards.length === 0 ? (
        <div className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">
          이 주차에 게시된 핵심 Insight 카드가 없습니다.
        </div>
      ) : (
        <div className="space-y-3">
          {cards.map((card) => (
            <div
              key={card.id}
              ref={card.id === highlightCardId ? highlightedRef : undefined}
              className={cn(
                'rounded-xl transition-shadow',
                card.id === highlightCardId && 'ring-2 ring-brand-600/60'
              )}
            >
              <KeyInsightCard card={card} mode="public" />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
