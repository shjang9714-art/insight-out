import Link from 'next/link'
import { ExternalLink } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { CompetitorWeeklyReportRow } from '@/lib/competitor-weekly/query'
import { stripInlineCitations } from '@/lib/competitor-weekly/strip-citations'

const IMPACT_CHIP: Record<string, string> = {
  위기: 'bg-negative-soft text-negative',
  기회: 'bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300',
  관망: 'bg-muted text-muted-foreground',
}

function ImpactChip({ impact, size = 'sm' }: { impact: string | null; size?: 'sm' | 'md' }) {
  if (!impact) return null
  return (
    <span
      className={cn(
        'rounded-full font-semibold',
        size === 'md' ? 'px-2.5 py-1 text-xs' : 'px-2 py-0.5 text-[11px]',
        IMPACT_CHIP[impact] ?? 'bg-muted text-muted-foreground',
      )}
    >
      {impact}
    </span>
  )
}

function formatWeekRange(weekStart: string, weekEnd: string): string {
  const fmt = (d: string) => {
    const date = new Date(`${d}T00:00:00+09:00`)
    return date.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' })
  }
  return `${fmt(weekStart)} ~ ${fmt(weekEnd)}`
}

interface Props {
  report: CompetitorWeeklyReportRow
}

/** 261 — 주간 경쟁사 동향 리포트 렌더(사업영역별 종합 + 위기/기회 + 근거). */
export default function CompetitorWeeklyReport({ report }: Props) {
  const { week_start, week_end, summary, overall_impact, emerging_topics, sections } = report

  return (
    <div className="space-y-4">
      {/* 리포트 헤더 */}
      <div className="rounded-xl border border-border bg-card p-5 space-y-2.5">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-medium text-muted-foreground">
            {formatWeekRange(week_start, week_end)} 주간 경쟁사 동향
          </span>
          <ImpactChip impact={overall_impact} size="md" />
        </div>
        {summary && (
          <p className="text-base font-semibold text-foreground leading-snug">{stripInlineCitations(summary)}</p>
        )}
        {emerging_topics.length > 0 && (
          <div className="flex flex-wrap gap-1.5 pt-1">
            {emerging_topics.map((topic, i) => (
              <span
                key={i}
                className="rounded-full border border-border px-2.5 py-0.5 text-[11px] text-muted-foreground"
              >
                #{topic}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* 사업 영역별 섹션 */}
      <div className="space-y-3">
        {sections.map((section) => (
          <div key={section.area_key} className="rounded-xl border border-border bg-card p-5 space-y-3">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-[15px] font-bold text-foreground">{section.area_label}</h3>
              <ImpactChip impact={section.impact} />
              {section.companies.length > 0 && (
                <div className="flex flex-wrap gap-1 ml-1">
                  {section.companies.map((c, i) => (
                    <span
                      key={i}
                      className="rounded bg-brand-600/10 px-1.5 py-0.5 text-[11px] font-medium text-brand-600"
                    >
                      {c}
                    </span>
                  ))}
                </div>
              )}
            </div>

            <p className="text-sm text-foreground/90 leading-relaxed whitespace-pre-line">
              {stripInlineCitations(section.moves)}
            </p>

            {section.implication && (
              <p className="text-xs text-muted-foreground leading-relaxed border-l-2 border-brand-600/30 pl-3">
                {stripInlineCitations(section.implication)}
              </p>
            )}

            {section.citations.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {section.citations.map((c, i) => (
                  <Link
                    key={i}
                    href={`/dashboard/contents/${c.content_id}`}
                    target="_blank"
                    className="inline-flex items-center gap-1 rounded bg-accent px-2 py-0.5 text-[11px] text-muted-foreground hover:text-foreground transition-colors max-w-[240px] truncate"
                    title={c.quote}
                  >
                    <ExternalLink className="h-2.5 w-2.5 shrink-0" />
                    <span className="truncate">{c.quote}</span>
                  </Link>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
