import Link from 'next/link'
import { cn } from '@/lib/utils'
import {
  hasAnalysis,
  type CompetitorWeeklyReportRow,
  type CompetitorWeeklySection,
  type WeeklyEvent,
} from '@/lib/competitor-weekly/query'
import { cleanNarrative } from '@/lib/text/clean-narrative'
import LguImpactBadge from '@/components/contents/LguImpactBadge'
import AiMark from '@/components/ui/AiMark'

/** week_start/week_end 는 이미 KST 달력일 — Date 재구성 없이 그대로 쪼갠다 */
function formatWeekRange(weekStart: string, weekEnd: string): string {
  const [y, m, d] = weekStart.split('-')
  const [, m2, d2] = weekEnd.split('-')
  return `${y}.${m}.${d} – ${m2}.${d2}`
}

function isoWeekLabel(weekStart: string): string {
  const date = new Date(`${weekStart}T00:00:00Z`)
  const target = new Date(date)
  target.setUTCDate(target.getUTCDate() + 3)
  const firstThursday = new Date(Date.UTC(target.getUTCFullYear(), 0, 4))
  const week = 1 + Math.round(((target.getTime() - firstThursday.getTime()) / 86400000 - 3) / 7)
  return `${target.getUTCFullYear()} W${String(week).padStart(2, '0')}`
}

// ─── 각주 ─────────────────────────────────────────────────────────────────────

/** 근거 evt_id → [1][2] 위첨자. 하단 근거 목록(우리 DB 콘텐츠 상세)으로 연결된다. */
function Footnotes({ evidence, indexById }: { evidence: string[]; indexById: Map<string, number> }) {
  const nums = evidence.map(id => indexById.get(id)).filter((n): n is number => typeof n === 'number')
  if (nums.length === 0) return null
  return (
    <span className="ml-1 align-super text-[11px] font-medium text-brand-600">
      {nums.map(n => `[${n}]`).join('')}
    </span>
  )
}

// ─── 섹션 렌더 ────────────────────────────────────────────────────────────────

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <>
      <div className="pt-0.5 text-[12px] text-muted-foreground md:text-right">{label}</div>
      <div className="mb-7">{children}</div>
    </>
  )
}

function AnalysisSection({ section }: { section: CompetitorWeeklySection }) {
  const events = section.events ?? []
  const indexById = new Map(events.map((e, i) => [e.id, i + 1]))

  return (
    <section className="mb-12">
      <div className="mb-5 flex flex-wrap items-center gap-2 border-b-2 border-foreground/80 pb-2.5">
        <h2 className="text-lg font-bold tracking-tight text-foreground">{section.area_label}</h2>
        <LguImpactBadge impact={section.impact} showNeutral />
        {section.companies.length > 0 && (
          <span className="text-[12px] text-muted-foreground">{section.companies.join(' · ')}</span>
        )}
      </div>

      <div className="grid grid-cols-1 gap-x-5 md:grid-cols-[104px_minmax(0,1fr)]">
        {section.overview && (
          <Row label="01 · 개요">
            <p className="text-sm leading-[1.75] text-foreground">{cleanNarrative(section.overview)}</p>
          </Row>
        )}

        {(section.status_points?.length ?? 0) > 0 && (
          <Row label="02 · 현황">
            <div className="space-y-3.5">
              {section.status_points!.map((p, i) => (
                <div key={i}>
                  <p className="text-[15px] font-semibold leading-snug text-foreground">
                    {cleanNarrative(p.thesis)}
                    <Footnotes evidence={p.evidence} indexById={indexById} />
                  </p>
                  {p.detail && (
                    <p className="mt-1 text-sm leading-[1.7] text-muted-foreground">{cleanNarrative(p.detail)}</p>
                  )}
                </div>
              ))}
            </div>
          </Row>
        )}

        {(section.intents?.length ?? 0) > 0 && (
          <Row label="03 · 의도 분석">
            <div className="space-y-2">
              {section.intents!.map((it, i) => (
                <div key={i} className="rounded-lg bg-muted/40 px-3.5 py-3">
                  <p className="text-[13px] text-muted-foreground">
                    <span className="font-semibold text-foreground">{it.actor}</span>
                    {it.seeking && <> — 확보하려는 것: {it.seeking}</>}
                  </p>
                  <p className="mt-1 text-sm leading-[1.7] text-foreground">
                    {cleanNarrative(it.reading)}
                    <Footnotes evidence={it.evidence} indexById={indexById} />
                  </p>
                </div>
              ))}
            </div>
          </Row>
        )}

        {((section.conflict_areas?.length ?? 0) > 0 || section.asymmetry) && (
          <Row label="04 · LG U+ 관점">
            {(section.conflict_areas?.length ?? 0) > 0 && (
              <div className="mb-3 flex flex-wrap items-center gap-1.5">
                <span className="text-[12px] text-muted-foreground">충돌면</span>
                {section.conflict_areas!.map((c, i) => (
                  <span
                    key={c}
                    className={cn(
                      'rounded-md px-2 py-0.5 text-[12px] font-medium',
                      i === 0
                        ? 'bg-negative-soft text-negative'
                        : 'bg-muted text-muted-foreground'
                    )}
                  >
                    {c}
                  </span>
                ))}
              </div>
            )}
            {section.asymmetry && (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="border-t border-border pt-2">
                  <p className="mb-1 text-[12px] text-muted-foreground">그쪽이 가진 것</p>
                  <p className="text-sm leading-[1.7] text-foreground">{cleanNarrative(section.asymmetry.theirs)}</p>
                </div>
                <div className="border-t border-border pt-2">
                  <p className="mb-1 text-[12px] text-muted-foreground">우리가 가진 것</p>
                  <p className="text-sm leading-[1.7] text-foreground">
                    {cleanNarrative(section.asymmetry.ours)}
                    <Footnotes evidence={section.asymmetry.evidence} indexById={indexById} />
                  </p>
                </div>
              </div>
            )}
          </Row>
        )}

        {((section.options?.length ?? 0) > 0 || (section.watch_metrics?.length ?? 0) > 0) && (
          <Row label="05 · 시사점">
            {(section.options?.length ?? 0) > 0 && (
              <ol className="mb-3.5 space-y-1.5">
                {section.options!.map((o, i) => (
                  <li key={i} className="text-sm leading-[1.75] text-foreground">
                    <span className="font-semibold">{i + 1}. {cleanNarrative(o.action)}</span>
                    {o.rationale && <span className="text-muted-foreground"> — {cleanNarrative(o.rationale)}</span>}
                  </li>
                ))}
              </ol>
            )}
            {(section.watch_metrics?.length ?? 0) > 0 && (
              <div className="border-l-[3px] border-brand-600 pl-3">
                <p className="mb-1 text-[12px] text-muted-foreground">지켜볼 지표</p>
                <ul className="space-y-1.5">
                  {section.watch_metrics!.map((w, i) => (
                    <li key={i} className="flex gap-2 text-[13px] leading-[1.8] text-foreground">
                      <span aria-hidden className="mt-[0.62em] size-1.5 shrink-0 rounded-full bg-brand-600" />
                      <span>
                        {cleanNarrative(w.metric)}
                        {w.if_then && <span className="text-muted-foreground"> — {cleanNarrative(w.if_then)}</span>}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </Row>
        )}

        {events.length > 0 && (
          <Row label="근거">
            <ol className="space-y-1 border-t border-border pt-2">
              {events.map((e: WeeklyEvent, i) => (
                <li key={e.id} className="text-[12px] leading-[1.8] text-muted-foreground">
                  <span className="text-brand-600">[{i + 1}]</span>{' '}
                  <Link
                    href={`/dashboard/contents/${e.content_id}`}
                    prefetch={false}
                    className="transition-colors hover:text-brand-600"
                  >
                    {e.source_name || e.event}
                  </Link>{' '}
                  · {e.date}
                </li>
              ))}
            </ol>
          </Row>
        )}
      </div>
    </section>
  )
}

/** 348 이전에 생성된 리포트 — moves/implication 만 있다 */
function LegacySection({ section }: { section: CompetitorWeeklySection }) {
  return (
    <section className="mb-8 rounded-xl border border-border bg-card p-5">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h2 className="text-[15px] font-bold text-foreground">{section.area_label}</h2>
        <LguImpactBadge impact={section.impact} showNeutral />
      </div>
      <p className="whitespace-pre-line text-sm leading-relaxed text-foreground/90">
        {cleanNarrative(section.moves)}
      </p>
      {section.implication && (
        <p className="mt-3 border-l-2 border-brand-600/30 pl-3 text-xs leading-relaxed text-muted-foreground">
          {cleanNarrative(section.implication)}
        </p>
      )}
    </section>
  )
}

interface Props {
  report: CompetitorWeeklyReportRow
}

/**
 * 261 → 348 재작성 — 주간 경쟁사 동향 리포트.
 * 지면(paper)형: 좌측 마진 섹션 넘버 + 개요/현황/의도 분석/LG U+ 관점/시사점 + 하단 근거.
 * 분석(패스②)이 없는 과거 리포트는 레거시 렌더로 폴백한다.
 */
export default function CompetitorWeeklyReport({ report }: Props) {
  const { week_start, week_end, summary, overall_impact, emerging_topics, sections } = report
  const totalEvents = (sections ?? []).reduce((n, s) => n + (s.events?.length ?? 0), 0)
  const conflictAreas = [...new Set((sections ?? []).flatMap(s => s.conflict_areas ?? []))]

  return (
    <article className="io-report">
      {/* 350: 제호(mast) — "경쟁사 동향 브리핑" 을 확실히 단다. 그 아래 주차·근거·판정. */}
      <header className="mb-8 border-b-2 border-foreground pb-4">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <span className="text-[15px] font-bold tracking-tight text-foreground">
            경쟁사 동향 브리핑
            <AiMark size="sm" className="ml-1" />
            <span className="ml-2 text-[12px] font-bold uppercase tracking-[0.14em] text-brand-700">
              {isoWeekLabel(week_start)}
            </span>
          </span>
          <span className="text-[12px] text-muted-foreground">
            {formatWeekRange(week_start, week_end)}
            {totalEvents > 0 && ` · 근거 ${totalEvents}건`}
          </span>
        </div>

        {summary && (
          <h1 className="mt-2.5 text-[24px] font-bold leading-[1.35] tracking-tight text-foreground">
            {cleanNarrative(summary)}
          </h1>
        )}

        <div className="mt-2 flex flex-wrap items-center gap-2">
          <LguImpactBadge impact={overall_impact} showNeutral />
          {conflictAreas.length > 0 && (
            <span className="text-[12px] text-muted-foreground">{conflictAreas.join(' · ')}</span>
          )}
          {emerging_topics.length > 0 && (
            <span className="text-[12px] text-muted-foreground">{emerging_topics.join(' · ')}</span>
          )}
        </div>
      </header>

      {(sections ?? []).map(section =>
        hasAnalysis(section)
          ? <AnalysisSection key={section.area_key} section={section} />
          : <LegacySection key={section.area_key} section={section} />
      )}
    </article>
  )
}
