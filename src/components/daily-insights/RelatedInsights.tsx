import Link from 'next/link'
import CategoryDotChip from '@/components/daily-insights/CategoryDotChip'
import type { DailyInsightRow } from '@/lib/daily-insights/types'
import { formatWeekLabel } from '@/lib/daily-insights/weeks'
import { stripLlmArtifacts } from '@/lib/text/strip-llm-artifacts'

interface RelatedInsightsProps {
  insights: DailyInsightRow[]
}

/** §2.5③ 관련 인사이트 — 같은 카테고리/이슈의 다른 주차 2~4건(published·자기 제외). 상세 전용. */
export default function RelatedInsights({ insights }: RelatedInsightsProps) {
  if (insights.length === 0) return null

  return (
    <section className="space-y-3">
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground/80">🔗 관련 인사이트</p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {insights.map((item) => (
          <Link
            key={item.id}
            href={`/dashboard/daily-insights/${item.id}`}
            prefetch={false}
            className="group block rounded-lg border border-border bg-muted/20 p-3 transition-colors hover:border-brand-600/40 hover:bg-accent/40"
          >
            <div className="mb-1 flex items-center gap-1.5">
              {item.category && <CategoryDotChip category={item.category} />}
              {item.week_of && (
                <span className="text-[10px] text-muted-foreground/70">{formatWeekLabel(item.week_of)} 주</span>
              )}
            </div>
            <p className="text-sm font-medium leading-snug text-foreground transition-colors group-hover:text-brand-700">
              {stripLlmArtifacts(item.headline)}
            </p>
          </Link>
        ))}
      </div>
    </section>
  )
}
