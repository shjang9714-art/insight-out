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

interface Props {
  llmProviders: LlmProviderUsage[]
  translationChars: number
  ttsChars: number
  ttsMonthlyCap: number | null
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
}: Props) {
  return (
    <section aria-label="사용량 및 수집 관리">
      <AdminSectionHeader icon={Activity} title="사용량 및 수집 관리" hint="LLM·번역·TTS 사용량을 확인합니다." />

      <div className="grid grid-cols-1 gap-4">
        {/* 사용량 바 */}
        <div className="rounded-xl border border-border bg-card p-5 space-y-4">
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
      </div>
    </section>
  )
}
