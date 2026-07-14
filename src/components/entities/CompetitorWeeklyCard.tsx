import Link from 'next/link'
import { cn } from '@/lib/utils'
import type { CompetitorWeeklyCardRow } from '@/lib/competitor-weekly/query'
import { cleanNarrative } from '@/lib/text/clean-narrative'
import LguImpactBadge from '@/components/contents/LguImpactBadge'

function formatWeekRange(weekStart: string, weekEnd: string): string {
  const fmt = (d: string, withYear: boolean) => {
    const [year, month, day] = d.split('-')
    const md = `${month}.${day}`
    return withYear ? `${year}.${md}` : md
  }
  return `${fmt(weekStart, true)}–${fmt(weekEnd, false)}`
}

interface Props {
  report: CompetitorWeeklyCardRow
}

/** 위기/기회는 색 점으로만 — 카드 안에서 배지를 또 쓰면 종합 판정 배지가 묻힌다 */
const SECTION_DOT: Record<string, string> = {
  위기: 'bg-negative',
  기회: 'bg-positive',
  관망: 'bg-muted-foreground/40',
}

/**
 * 283 — 경쟁사 주간 리포트 카드(탭 목록용). 클릭 시 상세(week 라우트)로 이동.
 * 344: 주요 기업 카드(343)와 동일한 톤 — 요약이 제목 역할(17px/700), 해시 기호 제거·태그 2개+N.
 * 345: 제목만으로는 클릭 유도가 약해 사업영역별 핵심 동향(sections) 2건을 요약으로 함께 노출.
 * 종합 판정(위기/기회/관망) 배지가 이 카드의 유일한 강조 요소다.
 */
export default function CompetitorWeeklyCard({ report }: Props) {
  const { week_start, week_end, summary, overall_impact, emerging_topics, sections } = report
  const topics = emerging_topics.slice(0, 2)
  const restTopics = emerging_topics.length - topics.length
  const highlights = (sections ?? []).slice(0, 2)
  const restSections = (sections ?? []).length - highlights.length

  return (
    <Link
      href={`/dashboard/entities/competitor-weekly/${week_start}`}
      prefetch={false}
      className="group flex h-full flex-col gap-3 rounded-xl border border-border bg-card p-5 transition-all hover:border-brand-200 hover:shadow-[0_2px_12px_-4px_rgb(0_0_0/0.10)]"
    >
      <div className="flex items-center gap-2">
        <span className="text-[13px] font-semibold tabular-nums text-muted-foreground">
          {formatWeekRange(week_start, week_end)}
        </span>
        <div className="flex-1" />
        <LguImpactBadge impact={overall_impact} showNeutral />
      </div>

      {summary && (
        <p className="text-[17px] font-bold leading-[1.35] text-foreground line-clamp-2 transition-colors group-hover:text-brand-600">
          {cleanNarrative(summary)}
        </p>
      )}

      {highlights.length > 0 && (
        <ul className="space-y-2 rounded-lg bg-muted/40 px-3.5 py-3">
          {highlights.map(section => (
            <li key={section.area_key} className="space-y-0.5">
              <div className="flex items-center gap-1.5">
                <span className={cn('size-1.5 shrink-0 rounded-full', SECTION_DOT[section.impact] ?? SECTION_DOT['관망'])} />
                <span className="truncate text-[11px] font-semibold text-foreground/70">{section.area_label}</span>
              </div>
              <p className="text-[13px] leading-relaxed text-muted-foreground line-clamp-2">
                {cleanNarrative(section.moves)}
              </p>
            </li>
          ))}
          {restSections > 0 && (
            <li className="text-[11px] text-muted-foreground/70">사업영역 {restSections}건 더</li>
          )}
        </ul>
      )}

      <div className="flex-1" />

      {emerging_topics.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
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
          {restTopics > 0 && (
            <span className="text-[11px] font-medium text-muted-foreground/70">+{restTopics}</span>
          )}
        </div>
      )}

      <p className="text-[11px] text-muted-foreground/70">주간 종합 리포트 →</p>
    </Link>
  )
}
