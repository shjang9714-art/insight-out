'use client'

import { useRouter } from 'next/navigation'
import { ChevronLeft, ChevronRight } from 'lucide-react'

interface TrendingHistoryPickerProps {
  selectedDate: string
  todayKst: string
}

function shiftDate(dateStr: string, deltaDays: number): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const utcMs = Date.UTC(y, m - 1, d) + deltaDays * 24 * 60 * 60 * 1000
  const shifted = new Date(utcMs)
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, '0')}-${String(shifted.getUTCDate()).padStart(2, '0')}`
}

export default function TrendingHistoryPicker({ selectedDate, todayKst }: TrendingHistoryPickerProps) {
  const router = useRouter()

  const goTo = (date: string) => {
    if (date === todayKst) router.push('/dashboard/trending')
    else router.push(`/dashboard/trending?date=${date}`)
  }

  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        aria-label="전날"
        onClick={() => goTo(shiftDate(selectedDate, -1))}
        className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      >
        <ChevronLeft className="h-4 w-4" />
      </button>
      <input
        type="date"
        value={selectedDate}
        max={todayKst}
        onChange={e => e.target.value && goTo(e.target.value)}
        className="rounded-lg border border-border bg-background px-2 py-1 text-sm text-foreground"
      />
      <button
        type="button"
        aria-label="다음날"
        disabled={selectedDate >= todayKst}
        onClick={() => goTo(shiftDate(selectedDate, 1))}
        className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-30 disabled:pointer-events-none"
      >
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  )
}
