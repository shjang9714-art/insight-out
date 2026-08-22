import { Milestone } from 'lucide-react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getKstWeekMondayString } from '@/lib/date'
import type { WeeklyFlowRow, WeeklyFlowStep } from '@/lib/daily-insights/types'
import { formatWeekLabel } from '@/lib/daily-insights/weeks'
import { stripLlmArtifacts } from '@/lib/text/strip-llm-artifacts'

// ─── 컴포넌트 ─────────────────────────────────────────────────────────────────
// 홈 "이번 주 한눈에 보는 흐름"(§5-A, 지시서 20260716/20260721) — weekly_flows(주차당
// 최대 3행, rank 오름차순) 소스. ★ 핵심 인사이트와 시각적으로 완전히 별개인 독립 모듈
// (자체 컨테이너·제목·점선 테두리로 구분). 현재 KST 주 월요일(week_of) 행만 읽어 흐름마다
// headline + 원인~시장반응 세로 타임라인. 지난주 데이터로 폴백하지 않는다 — 이번 주에 행이
// 없으면 그냥 숨김(§5-A 지시서 20260812 fast-follow: 지난주 흐름을 "이번 주"로 잘못 노출하던 버그 수정).

const MMDD_FORMATTER = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Seoul',
  month: '2-digit',
  day: '2-digit',
})

/** "MM-DD" (KST) — en-CA 로케일이 hyphen 구분 MM-DD를 보장(ko-KR은 "07. 14." 마침표 포맷). */
function formatMMDD(dateStr: string): string {
  return MMDD_FORMATTER.format(new Date(dateStr))
}

function FlowStepBody({ step }: { step: WeeklyFlowStep }) {
  const article = step.article
  const dateLabel = article?.published_at ? formatMMDD(article.published_at) : null
  const sourceLabel = article?.source && article.source !== '(미상)' ? article.source : null

  return (
    <div className="pb-4">
      <p className="flex items-baseline gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-brand-700">
        {step.phase}
        {dateLabel && <span className="font-mono normal-case tracking-normal text-muted-foreground">{dateLabel}</span>}
      </p>
      {article?.content_id ? (
        // 다른 뉴스 링크(ContentRow/ContentListRow 등)와 동일하게 내부 콘텐츠 상세를 새 탭으로 연다.
        <Link
          href={`/dashboard/contents/${article.content_id}`}
          prefetch={false}
          target="_blank"
          rel="noopener"
          title={article.title}
          aria-label={article.title}
          className="mt-0.5 block text-sm leading-relaxed text-foreground underline decoration-transparent underline-offset-2 transition-colors hover:cursor-pointer hover:text-brand-700 hover:decoration-brand-700"
        >
          {stripLlmArtifacts(step.text)}
        </Link>
      ) : article?.url ? (
        <a
          href={article.url}
          target="_blank"
          rel="noopener noreferrer"
          title={article.title}
          aria-label={article.title}
          className="mt-0.5 block text-sm leading-relaxed text-foreground underline decoration-transparent underline-offset-2 transition-colors hover:cursor-pointer hover:text-brand-700 hover:decoration-brand-700"
        >
          {stripLlmArtifacts(step.text)}
        </a>
      ) : (
        <p className="mt-0.5 text-sm leading-relaxed text-foreground">{stripLlmArtifacts(step.text)}</p>
      )}
      {sourceLabel && <p className="mt-0.5 text-[11px] text-muted-foreground/70">{sourceLabel}</p>}
    </div>
  )
}

function FlowBlock({ row }: { row: WeeklyFlowRow }) {
  const flow = row.flow ?? []
  if (flow.length === 0) return null

  return (
    <div>
      {row.headline && (
        <h3 className="mb-4 text-lg font-semibold leading-snug text-foreground">{stripLlmArtifacts(row.headline)}</h3>
      )}
      <ol>
        {flow.map((step, i) => (
          <li key={`${step.phase}-${i}`} className="flex gap-3">
            <div className="flex flex-col items-center">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-600/15 text-[11px] font-semibold text-brand-700 dark:text-brand-300">
                {i + 1}
              </span>
              {i < flow.length - 1 && <span className="mt-1 w-px flex-1 bg-border" aria-hidden />}
            </div>
            <FlowStepBody step={step} />
          </li>
        ))}
      </ol>
    </div>
  )
}

export default async function WeeklyFlowHighlight() {
  const supabase = await createClient()
  const currentWeekOf = getKstWeekMondayString(new Date())

  const { data } = await supabase
    .from('weekly_flows')
    .select('*')
    .eq('week_of', currentWeekOf)
    .order('rank', { ascending: true })
    .limit(3)

  const rows = (data ?? []) as WeeklyFlowRow[]
  if (rows.length === 0) return null

  return (
    <div className="mb-8 rounded-2xl border border-dashed border-brand-600/30 bg-muted/20 p-6">
      <div className="mb-4 flex items-center gap-1.5 text-[13px] font-medium text-muted-foreground">
        <Milestone className="h-3.5 w-3.5" />
        이번 주 한눈에 보는 흐름 · {formatWeekLabel(currentWeekOf)}
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 md:gap-0">
        {rows.map((row, i) => (
          <div
            key={row.rank}
            className={
              i > 0
                ? 'border-t border-border/60 pt-6 md:border-l md:border-t-0 md:pl-7 md:pt-0'
                : 'md:pr-7'
            }
          >
            <FlowBlock row={row} />
          </div>
        ))}
      </div>
    </div>
  )
}
