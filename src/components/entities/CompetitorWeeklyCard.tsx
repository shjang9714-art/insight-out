import Link from 'next/link'
import type { CompetitorWeeklyCardRow } from '@/lib/competitor-weekly/query'
import { stripLlmArtifacts } from '@/lib/text/strip-llm-artifacts'
import LguImpactBadge from '@/components/contents/LguImpactBadge'

function formatWeekRange(weekStart: string, weekEnd: string): string {
  const fmt = (d: string, withYear: boolean) => {
    const date = new Date(`${d}T00:00:00+09:00`)
    return withYear
      ? `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getDate()).padStart(2, '0')}`
      : `${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getDate()).padStart(2, '0')}`
  }
  return `${fmt(weekStart, true)} ~ ${fmt(weekEnd, false)}`
}

interface Props {
  report: CompetitorWeeklyCardRow
}

/** 283 — 경쟁사 주간 리포트 카드(탭 목록용). 클릭 시 상세(week 라우트)로 이동. */
export default function CompetitorWeeklyCard({ report }: Props) {
  const { week_start, week_end, summary, overall_impact, emerging_topics } = report

  return (
    <Link
      href={`/dashboard/entities/competitor-weekly/${week_start}`}
      prefetch={false}
      className="group flex h-full flex-col rounded-2xl border border-border bg-card p-5 transition-all hover:border-brand-200 hover:shadow-md"
    >
      <div className="mb-2 flex items-center gap-2 flex-wrap">
        <span className="text-xs font-medium text-muted-foreground">
          {formatWeekRange(week_start, week_end)}
        </span>
        <LguImpactBadge impact={overall_impact} showNeutral />
      </div>

      {summary && (
        <p className="mb-2 line-clamp-3 text-sm font-medium leading-snug text-foreground">
          {stripLlmArtifacts(summary)}
        </p>
      )}

      {emerging_topics.length > 0 && (
        <div className="mt-auto flex flex-wrap gap-1.5 pt-1">
          {emerging_topics.slice(0, 3).map((topic, i) => (
            <span
              key={i}
              className="rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground"
            >
              #{topic}
            </span>
          ))}
        </div>
      )}
    </Link>
  )
}
