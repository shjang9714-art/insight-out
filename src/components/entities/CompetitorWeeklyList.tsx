import Link from 'next/link'
import { ArrowUpRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { CompetitorWeeklyCardRow } from '@/lib/competitor-weekly/query'
import { cleanNarrative } from '@/lib/text/clean-narrative'
import LguImpactBadge from '@/components/contents/LguImpactBadge'

/** week_start/week_end 는 이미 KST 달력일 — Date 재구성 없이 그대로 쪼갠다(자정 밀림 방지) */
function formatWeekRange(weekStart: string, weekEnd: string): string {
  const [y, m, d] = weekStart.split('-')
  const [, m2, d2] = weekEnd.split('-')
  return `${y}.${m}.${d} – ${m2}.${d2}`
}

/** 섹션 위기/기회는 색 점으로만 — 배지를 반복하면 상단 종합 판정이 묻힌다 */
const SECTION_DOT: Record<string, string> = {
  위기: 'bg-negative',
  기회: 'bg-positive',
  관망: 'bg-muted-foreground/40',
}

interface Props {
  reports: CompetitorWeeklyCardRow[]
}

/**
 * 경쟁사 주간 리포트 목록(283 → 346 재설계).
 * 홈 "핵심 Insight"(DailyInsightHomeHighlights)와 동일한 에디토리얼 톤 — 3열 그리드가 아니라
 * **1열 전폭 리스트**. 주간 리포트는 건수가 적고 내용이 길어서 카드 그리드에 맞지 않는다.
 * 목록에서 사업영역별 요약까지 읽히고, 클릭하면 상세로 들어간다.
 */
export default function CompetitorWeeklyList({ reports }: Props) {
  return (
    <ol className="divide-y divide-border rounded-2xl border border-border bg-card px-6">
      {reports.map(report => {
        const { id, week_start, week_end, summary, overall_impact, emerging_topics, sections } = report
        const highlights = (sections ?? []).slice(0, 3)
        const restSections = (sections ?? []).length - highlights.length
        const topics = emerging_topics.slice(0, 3)

        return (
          <li key={id} className="py-6">
            <Link
              href={`/dashboard/entities/competitor-weekly/${week_start}`}
              prefetch={false}
              className="group block"
            >
              <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-brand-700">
                  {formatWeekRange(week_start, week_end)}
                </span>
                <LguImpactBadge impact={overall_impact} showNeutral />
                <div className="flex-1" />
                <span className="inline-flex shrink-0 items-center gap-0.5 text-[12px] font-medium text-muted-foreground transition-colors group-hover:text-brand-700">
                  상세 보기
                  <ArrowUpRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                </span>
              </div>

              {summary && (
                <h3 className="mt-2 text-[19px] font-bold leading-snug tracking-tight text-foreground transition-colors group-hover:text-brand-700">
                  {cleanNarrative(summary)}
                </h3>
              )}

              {highlights.length > 0 && (
                <div className="mt-4 grid gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
                  {highlights.map(section => (
                    <div key={section.area_key}>
                      <div className="mb-1 flex items-center gap-1.5">
                        <span className={cn('size-1.5 shrink-0 rounded-full', SECTION_DOT[section.impact] ?? SECTION_DOT['관망'])} />
                        <span className="truncate text-[12px] font-semibold text-foreground/70">{section.area_label}</span>
                      </div>
                      <p className="text-[13px] leading-relaxed text-muted-foreground line-clamp-3">
                        {cleanNarrative(section.moves)}
                      </p>
                    </div>
                  ))}
                </div>
              )}

              {(topics.length > 0 || restSections > 0) && (
                <div className="mt-4 flex flex-wrap items-center gap-1.5">
                  {topics.map((topic, i) => (
                    <span
                      key={topic}
                      className={
                        i === 0
                          ? 'rounded-md bg-brand-50 px-2 py-0.5 text-[11px] font-medium text-brand-700 dark:bg-brand-950/30 dark:text-brand-300'
                          : 'rounded-md bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground'
                      }
                    >
                      {topic}
                    </span>
                  ))}
                  {restSections > 0 && (
                    <span className="text-[11px] text-muted-foreground/70">사업영역 {restSections}건 더</span>
                  )}
                </div>
              )}
            </Link>
          </li>
        )
      })}
    </ol>
  )
}
