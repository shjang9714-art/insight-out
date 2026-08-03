import type { ReactNode } from 'react'
import { Activity, Info } from 'lucide-react'
import { cn } from '@/lib/utils'
import AdminSectionHeader from '@/components/admin/ui/AdminSectionHeader'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'

export interface LlmProviderUsage {
  name: string
  configured: boolean
  enabled: boolean
  keyCount: number
  tokensUsed: number
  tokenLimit: number
}

interface Props {
  llmProviders: LlmProviderUsage[]
  period: string
  providerTasks: Record<string, string[]>
  translationChars: number
  ttsChars: number
  ttsMonthlyCap: number | null
}

const TASK_LABELS: Record<string, string> = {
  classify: '분류·감성·시그널·LGU임팩트·이슈매칭',
  summarize: '요약·경쟁사주간·기업인사이트·브리핑하이라이트',
  report: 'AI 리포트·이슈브리프·이슈후보·엔티티이벤트·엔티티정규화',
  briefing: '모닝브리핑 스크립트',
  key_insight: '키워드 인사이트',
  daily_insight: '데일리 인사이트',
  newsletter_card_insight: '뉴스레터 카드 인사이트',
}

function ProviderInfo({ provider, tasks }: { provider: string; tasks: string[] }) {
  const labels = tasks.map(task => TASK_LABELS[task]).filter((label): label is string => Boolean(label))
  const title = labels.length > 0 ? labels.join('\n') : '폴백 대기'

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          title={title}
          aria-label={`${provider} 활용처 보기`}
          className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-muted-foreground/60 transition-colors hover:bg-muted hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        >
          <Info className="h-3.5 w-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent side="right" align="start" className="w-80 text-xs leading-relaxed">
        <p className="mb-2 text-sm font-semibold text-foreground">{provider} 활용처</p>
        {labels.length > 0 ? (
          <ul className="space-y-1.5 text-muted-foreground">
            {labels.map(label => <li key={label}>• {label}</li>)}
          </ul>
        ) : (
          <p className="text-muted-foreground">폴백 대기</p>
        )}
      </PopoverContent>
    </Popover>
  )
}

function ProviderLabel({
  provider,
  keyCount,
  tasks,
}: {
  provider: string
  keyCount: number
  tasks: string[]
}) {
  const displayName = provider.charAt(0).toUpperCase() + provider.slice(1)

  return (
    <span className="flex min-w-0 items-center gap-1.5">
      <span className="font-medium text-foreground">{displayName}</span>
      <ProviderInfo provider={displayName} tasks={tasks} />
      <span
        className={cn(
          'shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium',
          keyCount > 0 ? 'bg-muted text-muted-foreground' : 'bg-amber-500/10 text-amber-600',
        )}
      >
        {keyCount > 0 ? `키 ${keyCount}개` : '키 미등록'}
      </span>
    </span>
  )
}

function UsageBar({ used, limit, label }: { used: number; limit: number; label: ReactNode }) {
  const pct = limit > 0 ? Math.round((used / limit) * 100) : 0
  // 197 — 100% 위험만 또렷하게, 그 아래는 연한 톤(brand-600/amber 에 투명도)으로 차분하게
  const barColor =
    pct >= 100 ? 'bg-destructive'
    : pct >= 80  ? 'bg-amber-500/60'
    : 'bg-brand-600/50'
  const textColor =
    pct >= 100 ? 'text-destructive'
    : pct >= 80  ? 'text-amber-600'
    : 'text-muted-foreground'

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium text-foreground">{label}</span>
        <span className={cn('tabular-nums', textColor)}>
          {used.toLocaleString()} / {limit.toLocaleString()} ({pct}%)
        </span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={cn('h-full rounded-full transition-all', barColor)}
          style={{ width: `${Math.min(pct, 100)}%` }}
        />
      </div>
    </div>
  )
}

export default function AdminOpsSignals({
  llmProviders,
  period,
  providerTasks,
  translationChars,
  ttsChars,
  ttsMonthlyCap,
}: Props) {
  return (
    <section aria-label="사용량 및 수집 관리">
      <AdminSectionHeader icon={Activity} title="사용량 및 수집 관리" hint="LLM·번역·TTS 사용량을 확인합니다." />

      <div className="grid grid-cols-1 gap-4">
        {/* 사용량 바 */}
        <div className="rounded-xl border border-border bg-card p-5 space-y-4">
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">사용량 / 한도</p>
            <p className="mt-1 text-xs text-muted-foreground">{period} 기준 · 매월 1일 자동 초기화</p>
          </div>

          {/* LLM */}
          {llmProviders.map(p => (
            !p.configured ? (
              <div key={p.name} className="flex items-center justify-between text-xs">
                <ProviderLabel
                  provider={p.name}
                  keyCount={p.keyCount}
                  tasks={providerTasks[p.name] ?? []}
                />
                <span className="rounded bg-muted px-2 py-0.5 text-muted-foreground">미설정</span>
              </div>
            ) : (
              <UsageBar
                key={p.name}
                label={(
                  <ProviderLabel
                    provider={p.name}
                    keyCount={p.keyCount}
                    tasks={providerTasks[p.name] ?? []}
                  />
                )}
                used={p.tokensUsed}
                limit={p.tokenLimit}
              />
            )
          ))}

          {/* 번역 */}
          <div className="flex items-center justify-between text-xs">
            <span className="font-medium text-foreground">번역(문자)</span>
            <span className="tabular-nums text-muted-foreground">{translationChars.toLocaleString()}자</span>
          </div>

          {/* TTS */}
          {ttsMonthlyCap != null && ttsMonthlyCap > 0 ? (
            <UsageBar label="TTS(문자)" used={ttsChars} limit={ttsMonthlyCap} />
          ) : (
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-foreground">TTS(문자)</span>
              <span className="tabular-nums text-muted-foreground">{ttsChars.toLocaleString()}자</span>
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
