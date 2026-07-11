'use client'

import { useState } from 'react'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { format } from 'date-fns'
import { ko } from 'date-fns/locale'
import type { DateRange } from 'react-day-picker'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import { DAILY_INSIGHT_PERIODS, type DailyInsightPeriod } from '@/lib/daily-insights/period'

/** "핵심 인사이트" 목록 기간 필터 버튼 그룹(§지시서 20260711 §1). URL(period/from/to)로 상태 유지. */
export default function DailyInsightPeriodFilter() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [calendarOpen, setCalendarOpen] = useState(false)

  const period = searchParams.get('period') as DailyInsightPeriod | null
  const from = searchParams.get('from')
  const to = searchParams.get('to')
  const [draftRange, setDraftRange] = useState<DateRange | undefined>(
    from && to ? { from: new Date(`${from}T00:00:00`), to: new Date(`${to}T00:00:00`) } : undefined,
  )

  function navigate(next: Record<string, string | undefined>) {
    const params = new URLSearchParams(searchParams.toString())
    for (const [key, value] of Object.entries(next)) {
      if (value === undefined) params.delete(key)
      else params.set(key, value)
    }
    const qs = params.toString()
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
  }

  function handlePresetClick(id: DailyInsightPeriod) {
    if (id === 'custom') {
      setCalendarOpen(true)
      return
    }
    if (period === id) {
      // 다시 누르면 전체(무필터)로 토글 해제
      navigate({ period: undefined, from: undefined, to: undefined })
      return
    }
    navigate({ period: id, from: undefined, to: undefined })
  }

  function handleRangeSelect(range: DateRange | undefined) {
    setDraftRange(range)
    if (range?.from && range?.to) {
      navigate({
        period: 'custom',
        from: format(range.from, 'yyyy-MM-dd'),
        to: format(range.to, 'yyyy-MM-dd'),
      })
      setCalendarOpen(false)
    }
  }

  const customLabel =
    period === 'custom' && from && to
      ? `${format(new Date(`${from}T00:00:00`), 'M.d', { locale: ko })} - ${format(new Date(`${to}T00:00:00`), 'M.d', { locale: ko })}`
      : '사용자 지정'

  return (
    <div className="flex items-center gap-1.5">
      {DAILY_INSIGHT_PERIODS.filter((p) => p.id !== 'custom').map((p) => (
        <Button
          key={p.id}
          type="button"
          size="sm"
          variant={period === p.id ? 'brand' : 'outline'}
          onClick={() => handlePresetClick(p.id)}
        >
          {p.label}
        </Button>
      ))}
      <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            size="sm"
            variant={period === 'custom' ? 'brand' : 'outline'}
            onClick={() => setCalendarOpen(true)}
            className={cn(period === 'custom' && 'tabular-nums')}
          >
            {customLabel}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="end">
          <Calendar
            mode="range"
            selected={draftRange}
            onSelect={handleRangeSelect}
            defaultMonth={draftRange?.from}
            locale={ko}
            numberOfMonths={2}
          />
        </PopoverContent>
      </Popover>
    </div>
  )
}
