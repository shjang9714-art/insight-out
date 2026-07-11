import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import type { DailyInsightRow } from '@/lib/daily-insights/types'

interface DailyInsightListProps {
  insights: DailyInsightRow[]
}

/** day_of('YYYY-MM-DD')는 생성 시점에 KST 달력일로 확정된 문자열 —
 * Date 재구성 없이 그대로 쪼개야 자정 근처 하루 밀림을 피한다. */
function formatKstMonthDay(dayOf: string): string {
  const [, month, day] = dayOf.split('-').map(Number)
  return `${month}월 ${day}일`
}

export default function DailyInsightList({ insights }: DailyInsightListProps) {
  if (insights.length === 0) {
    return (
      <div className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">
        최근 게시된 핵심 인사이트가 없습니다.
      </div>
    )
  }

  const dayGroups: { dayOf: string; items: DailyInsightRow[] }[] = []
  for (const item of insights) {
    const last = dayGroups[dayGroups.length - 1]
    if (last && last.dayOf === item.day_of) {
      last.items.push(item)
    } else {
      dayGroups.push({ dayOf: item.day_of, items: [item] })
    }
  }

  return (
    <div className="space-y-6">
      {dayGroups.map((group) => (
        <div key={group.dayOf} className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {formatKstMonthDay(group.dayOf)}
          </p>
          <div className="space-y-3">
            {group.items.map((item) => (
              <Link
                key={item.id}
                href={`/dashboard/daily-insights/${item.id}`}
                className="group block rounded-xl border border-border bg-card p-5 transition-colors hover:border-brand-600/40 hover:bg-accent/40"
              >
                {item.category && <Badge variant="secondary">{item.category}</Badge>}
                <p className="mt-1.5 font-semibold text-foreground leading-snug transition-colors group-hover:text-brand-700">
                  {item.headline}
                </p>
                <p className="mt-1.5 line-clamp-2 text-sm text-muted-foreground leading-relaxed">
                  {item.summary_ko}
                </p>
              </Link>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
