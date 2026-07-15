import type { NextStep } from '@/lib/daily-insights/types'
import { stripLlmArtifacts } from '@/lib/text/strip-llm-artifacts'

interface NextStepsProps {
  steps: NextStep[]
}

/** §5-B 이 이슈의 다음 단계 — "가능성 높은" 후속 전개(예언 아님). 상세 전용. */
export default function NextSteps({ steps }: NextStepsProps) {
  if (steps.length === 0) return null

  return (
    <section className="space-y-2">
      <div className="flex flex-wrap items-baseline gap-1.5">
        <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground/80">🔭 이 이슈의 다음 단계</p>
        <span className="text-[10px] text-muted-foreground/60">· 예측이 아닌 가능성 높은 후속 전개</span>
      </div>
      <ol className="space-y-2">
        {steps.map((s, i) => (
          <li key={`${s.step}-${i}`} className="flex gap-2.5 rounded-lg bg-muted/30 p-3">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-600/10 text-[11px] font-semibold text-brand-700 dark:text-brand-300">
              {i + 1}
            </span>
            <p className="text-[13px] leading-relaxed text-foreground">{stripLlmArtifacts(s.text)}</p>
          </li>
        ))}
      </ol>
    </section>
  )
}
