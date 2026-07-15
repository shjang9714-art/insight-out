'use client'

import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { formatWeekLabel } from '@/lib/daily-insights/weeks'
import { TOTAL_CATEGORY_COUNT } from '@/lib/daily-insights/weeks'

interface WeeklyInsightHeaderProps {
  weeks: string[]
  selectedWeek: string | null
  total: number
  newCount: number
  categoryCoverage: number
}

/** 주차 헤더(§2-a) — 주차 라벨 + 배지(N건·NEW·카테고리 커버리지) + 주차 선택기(드롭다운). */
export default function WeeklyInsightHeader({
  weeks,
  selectedWeek,
  total,
  newCount,
  categoryCoverage,
}: WeeklyInsightHeaderProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  function handleWeekChange(week: string) {
    const params = new URLSearchParams(searchParams.toString())
    params.set('week', week)
    router.replace(`${pathname}?${params.toString()}`, { scroll: false })
  }

  if (!selectedWeek || weeks.length === 0) return null

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold text-foreground">{formatWeekLabel(selectedWeek)}</span>
        <Badge variant="secondary">인사이트 {total}건</Badge>
        {newCount > 0 && (
          <Badge variant="secondary" className="bg-brand-600/10 text-brand-700 dark:text-brand-300">
            NEW {newCount}
          </Badge>
        )}
        <Badge variant="outline" className="text-muted-foreground">
          카테고리 커버리지 {categoryCoverage}/{TOTAL_CATEGORY_COUNT}
        </Badge>
      </div>

      <Select value={selectedWeek} onValueChange={handleWeekChange}>
        <SelectTrigger size="sm" className="w-auto min-w-[160px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent align="end">
          {weeks.map((week) => (
            <SelectItem key={week} value={week}>
              {formatWeekLabel(week)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
