import { Activity } from 'lucide-react'
import { cn } from '@/lib/utils'
import AdminSectionHeader from '@/components/admin/ui/AdminSectionHeader'

export interface LlmProviderUsage {
  name: string
  configured: boolean
  enabled: boolean
  tokensUsed: number
  tokenLimit: number
}

export interface OpsSignalCounts {
  issues: number
  entities: number
  insightCards: number
  aiReports: number
  contentSignals: number
}

interface Props {
  llmProviders: LlmProviderUsage[]
  translationChars: number
  ttsChars: number
  ttsMonthlyCap: number | null
  signalCounts: OpsSignalCounts
}

function UsageBar({ used, limit, label }: { used: number; limit: number; label: string }) {
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
  translationChars,
  ttsChars,
  ttsMonthlyCap,
  signalCounts,
}: Props) {
  const hasUnlit =
    signalCounts.issues === 0 ||
    signalCounts.entities === 0 ||
    signalCounts.insightCards === 0 ||
    signalCounts.contentSignals === 0

  const chips: { label: string; value: number }[] = [
    { label: '이슈',      value: signalCounts.issues },
    { label: '엔티티',    value: signalCounts.entities },
    { label: '인사이트',  value: signalCounts.insightCards },
    { label: '시그널',    value: signalCounts.contentSignals },
    { label: '보고서',    value: signalCounts.aiReports },
  ]

  return (
    <section aria-labelledby="ops-signals-heading">
      <AdminSectionHeader icon={Activity} title="운영 신호등" hint="사용량 한도와 데이터 점등 상태" />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* 사용량 바 */}
        <div className="rounded-xl border border-border bg-card p-4 space-y-4">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">사용량 / 한도</p>

          {/* LLM */}
          {llmProviders.map(p => (
            !p.configured ? (
              <div key={p.name} className="flex items-center justify-between text-xs">
                <span className="font-medium text-foreground capitalize">{p.name}</span>
                <span className="rounded px-2 py-0.5 bg-muted text-muted-foreground">미설정</span>
              </div>
            ) : (
              <UsageBar
                key={p.name}
                label={p.name.charAt(0).toUpperCase() + p.name.slice(1)}
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

        {/* 데이터 점등 */}
        <div className="rounded-xl border border-border bg-card p-4 space-y-3">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">데이터 점등</p>
          <div className="flex flex-wrap gap-2">
            {chips.map(chip => (
              <span
                key={chip.label}
                className={cn(
                  'inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 text-xs font-medium tabular-nums',
                  chip.value > 0
                    ? 'border-border text-foreground'
                    : 'border-border text-muted-foreground',
                )}
              >
                <span className={cn('h-1.5 w-1.5 rounded-full', chip.value > 0 ? 'bg-positive' : 'bg-muted-foreground/40')} />
                {chip.label} {chip.value.toLocaleString()}
              </span>
            ))}
          </div>
          {hasUnlit && (
            <p className="text-xs text-muted-foreground">
              0인 항목은 SQL 적용 / 수집 후 점등됩니다.
            </p>
          )}
        </div>
      </div>
    </section>
  )
}
