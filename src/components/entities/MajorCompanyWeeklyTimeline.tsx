import Link from 'next/link'
import { cn } from '@/lib/utils'
import type { MajorCompanyWeek } from '@/lib/entities/major-companies'

function formatWeekLabel(weekStart: string): string {
  const date = new Date(`${weekStart}T00:00:00+09:00`)
  return date.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' })
}

interface Props {
  weeks: MajorCompanyWeek[]
  activeWeekStart: string | null
  hrefBase: string
  persistentParams?: Record<string, string>
}

function weekHref(
  hrefBase: string,
  persistentParams: Record<string, string> | undefined,
  weekStart: string,
): string {
  const params = new URLSearchParams(persistentParams)
  params.set('week', weekStart)
  return `${hrefBase}?${params.toString()}`
}

/** 446 — 주요기업 월~일 아카이브를 주별 점·라벨로 탐색한다. */
export default function MajorCompanyWeeklyTimeline({
  weeks,
  activeWeekStart,
  hrefBase,
  persistentParams,
}: Props) {
  if (weeks.length === 0) return null

  return (
    <nav aria-label="주요 기업 주간 아카이브">
      <p className="mb-2 text-[13px] text-muted-foreground">
        주요 기업 주간 아카이브 · {weeks.length}주
      </p>
      <div className="flex items-center gap-1 overflow-x-auto pb-1">
        {[...weeks].reverse().map((week) => {
          const isActive = week.weekStart === activeWeekStart
          return (
            <Link
              key={week.weekStart}
              href={weekHref(hrefBase, persistentParams, week.weekStart)}
              prefetch={false}
              aria-current={isActive ? 'page' : undefined}
              className={cn(
                'flex shrink-0 flex-col items-center gap-1 rounded-lg px-2 py-1.5 transition-colors',
                isActive ? 'bg-brand-600/10' : 'hover:bg-accent',
              )}
              title={`${week.weekStart} ~ ${week.weekEnd}`}
            >
              <span
                aria-hidden
                className={cn(
                  'h-2.5 w-2.5 rounded-full',
                  isActive ? 'bg-brand-600' : 'bg-muted-foreground/40',
                )}
              />
              <span
                className={cn(
                  'text-[10px] whitespace-nowrap',
                  isActive ? 'font-semibold text-brand-600' : 'text-muted-foreground',
                )}
              >
                {formatWeekLabel(week.weekStart)}
              </span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
