import { Milestone } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import type { WeeklyFlowRow } from '@/lib/daily-insights/types'
import { formatWeekLabel } from '@/lib/daily-insights/weeks'
import { stripLlmArtifacts } from '@/lib/text/strip-llm-artifacts'

// ─── 컴포넌트 ─────────────────────────────────────────────────────────────────
// 홈 "이번 주 한눈에 보는 흐름"(§5-A, 지시서 20260716) — weekly_flows(주차당 1행) 소스.
// ★ 핵심 인사이트와 시각적으로 완전히 별개인 독립 모듈(자체 컨테이너·제목·점선 테두리로
// 구분). 최신 week_of 행을 읽어 원인~시장반응 단계를 세로 타임라인으로. 데이터 없으면 숨김.

export default async function WeeklyFlowHighlight() {
  const supabase = await createClient()

  const { data } = await supabase
    .from('weekly_flows')
    .select('*')
    .order('week_of', { ascending: false })
    .limit(1)

  const row = data?.[0] as WeeklyFlowRow | undefined
  const flow = row?.flow ?? []
  if (!row || flow.length === 0) return null

  return (
    <div className="mb-8 rounded-2xl border border-dashed border-brand-600/30 bg-muted/20 p-6">
      <div className="mb-4 flex items-center gap-1.5 text-[13px] font-medium text-muted-foreground">
        <Milestone className="h-3.5 w-3.5" />
        이번 주 한눈에 보는 흐름 · {formatWeekLabel(row.week_of)}
      </div>

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
            <div className="pb-4">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-brand-700">{step.phase}</p>
              <p className="mt-0.5 text-sm leading-relaxed text-foreground">{stripLlmArtifacts(step.text)}</p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  )
}
