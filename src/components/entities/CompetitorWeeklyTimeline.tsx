import Link from 'next/link'
import { cn } from '@/lib/utils'
import type { CompetitorWeeklyTimelineEntry } from '@/lib/competitor-weekly/query'

// 색상은 LguImpactBadge(공용 배지, 313)와 동일한 토큰 — 점(dot) 형태라 배지 컴포넌트 자체는 못 쓴다.
const IMPACT_DOT: Record<string, string> = {
  위기: 'bg-negative',
  기회: 'bg-positive',
  관망: 'bg-muted-foreground/40',
}

function formatWeekLabel(weekStart: string): string {
  const date = new Date(`${weekStart}T00:00:00+09:00`)
  return date.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' })
}

interface Props {
  entries: CompetitorWeeklyTimelineEntry[]
  /** 현재 보고 있는 주(강조 표시) */
  activeWeekStart?: string
}

/**
 * 261 — 경쟁 위협/기회 레이더: 과거 주간 리포트를 위기/기회 색 점으로 타임라인 표시.
 * 344: 박스 제거 — 카드가 유일한 시각 표면이어야 하므로 레이더는 라벨 + 점 스트립만 남긴다.
 */
export default function CompetitorWeeklyTimeline({ entries, activeWeekStart }: Props) {
  if (entries.length === 0) return null

  return (
    <div>
      <p className="mb-2 text-[13px] text-muted-foreground">경쟁 위협·기회 레이더 · 지난 {entries.length}주</p>
      <div className="flex items-center gap-1 overflow-x-auto pb-1">
        {[...entries].reverse().map((entry) => {
          const isActive = entry.week_start === activeWeekStart
          return (
            <Link
              key={entry.week_start}
              href={`/dashboard/entities/competitor-weekly/${entry.week_start}`}
              prefetch={false}
              className={cn(
                'flex shrink-0 flex-col items-center gap-1 rounded-lg px-2 py-1.5 transition-colors',
                isActive ? 'bg-brand-600/10' : 'hover:bg-accent',
              )}
              title={`${entry.week_start} ~ ${entry.week_end}`}
            >
              <span
                className={cn(
                  'h-2.5 w-2.5 rounded-full',
                  entry.overall_impact ? IMPACT_DOT[entry.overall_impact] : 'bg-muted-foreground/40',
                )}
              />
              <span className={cn('text-[10px] whitespace-nowrap', isActive ? 'font-semibold text-brand-600' : 'text-muted-foreground')}>
                {formatWeekLabel(entry.week_start)}
              </span>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
