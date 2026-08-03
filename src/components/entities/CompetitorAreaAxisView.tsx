import Link from 'next/link'
import StatusBadge from '@/components/admin/ui/StatusBadge'
import LguImpactBadge from '@/components/contents/LguImpactBadge'
import { cleanNarrative } from '@/lib/text/clean-narrative'
import {
  analysisState,
  hasAnalysis,
  type CompetitorWeeklyReportRow,
  type CompetitorWeeklySection,
  type WeeklyEvent,
} from '@/lib/competitor-weekly/query'

/** week_start/week_end 는 이미 KST 달력일 — CompetitorWeeklyReport 와 동일 포맷 */
function formatWeekRange(weekStart: string, weekEnd: string): string {
  const [y, m, d] = weekStart.split('-')
  const [, m2, d2] = weekEnd.split('-')
  return `${y}.${m}.${d} – ${m2}.${d2}`
}

/** 영역 1개 — 분석(패스②) 있으면 사건 목록, 없으면 레거시 사실 나열(moves) */
function AreaSection({ section }: { section: CompetitorWeeklySection }) {
  const events = section.events ?? []
  const analyzed = hasAnalysis(section)

  return (
    <section className="rounded-xl border border-border bg-card p-5">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h3 className="text-[15px] font-bold text-foreground">{section.area_label}</h3>
        {!analyzed && <StatusBadge tone="risk" label="분석 전" />}
        <LguImpactBadge impact={section.impact} showNeutral />
        {section.companies.length > 0 && (
          <span className="text-[12px] text-muted-foreground">{section.companies.join(' · ')}</span>
        )}
      </div>

      {analyzed && events.length > 0 ? (
        <ol className="space-y-1.5">
          {events.map((e: WeeklyEvent) => (
            <li key={e.id} className="text-sm leading-relaxed">
              <Link
                href={`/dashboard/contents/${e.content_id}`}
                prefetch={false}
                target="_blank"
                rel="noopener noreferrer"
                className="text-foreground transition-colors hover:text-brand-600"
              >
                {e.event}
              </Link>
              <span className="ml-1.5 text-[12px] text-muted-foreground">
                {e.source_name && `${e.source_name} · `}
                {e.date}
              </span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="whitespace-pre-line text-sm leading-relaxed text-foreground/90">
          {cleanNarrative(section.moves)}
        </p>
      )}
    </section>
  )
}

interface Props {
  report: CompetitorWeeklyReportRow
}

/**
 * 467 — 경쟁사 최근 뉴스(전체 페이지)의 '사업영역별' 축.
 * 회사축(상시)과 달리 패스①(주 1회 스냅샷) 산출물이므로 주 범위·스냅샷 표기로 성격을 명시한다.
 * 신규 조회 없음 — getLatestPublishedCompetitorWeeklyReport 결과를 그대로 렌더.
 */
export default function CompetitorAreaAxisView({ report }: Props) {
  const { week_start, week_end, sections } = report
  const reportState = analysisState(sections ?? [])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-xl border border-dashed border-border bg-muted/30 px-4 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge tone="info" label="주간 스냅샷" />
          <span className="text-[13px] text-muted-foreground">
            {formatWeekRange(week_start, week_end)} 기준 · 사업영역별 패스① 사실 나열(실시간 아님)
          </span>
          {reportState !== 'done' && (
            <StatusBadge
              tone="risk"
              label={reportState === 'none' ? '분석 전(사실만)' : '분석 일부'}
            />
          )}
        </div>
        <Link
          href={`/dashboard/entities/competitor-weekly/${week_start}`}
          prefetch={false}
          className="text-[13px] font-medium text-brand-600 transition-colors hover:text-brand-700"
        >
          주간 리포트 전체보기 →
        </Link>
      </div>

      {(sections ?? []).length === 0 ? (
        <div className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
          이번 주 사업영역별 동향이 없습니다.
        </div>
      ) : (
        <div className="space-y-4">
          {sections!.map((section) => (
            <AreaSection key={section.area_key} section={section} />
          ))}
        </div>
      )}
    </div>
  )
}
