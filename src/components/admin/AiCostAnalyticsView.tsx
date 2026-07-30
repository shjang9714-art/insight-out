'use client'

import { useRouter } from 'next/navigation'
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { CHART_MUTED } from '@/lib/admin/palette'
import type { AiCostAnalytics } from '@/lib/admin/analytics'

const MONTH_OPTIONS = [3, 6, 12] as const

const PROVIDER_COLORS: Record<string, string> = {
  gemini: '#4f86c6',
  groq: '#f4a261',
  cerebras: '#57cc99',
  sambanova: '#e76f51',
  mistral: '#9b5de5',
  openrouter: '#94a3b8',
}

function EmptyState() {
  return <p className="py-8 text-center text-sm text-muted-foreground">데이터 없음</p>
}

export default function AiCostAnalyticsView({ data, months }: { data: AiCostAnalytics; months: number }) {
  const router = useRouter()
  const { months: periods, llmByMonth, currentUsage, translationByMonth, ttsByMonth } = data

  const providers = [...new Set(llmByMonth.map(r => r.provider))]
  const stackedTokens = periods.map(period => {
    const row: Record<string, string | number> = { period }
    for (const provider of providers) {
      row[provider] = llmByMonth.find(r => r.period === period && r.provider === provider)?.tokens ?? 0
    }
    return row
  })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <span className="admin-caption text-muted-foreground">기간</span>
          <div className="flex gap-1">
            {MONTH_OPTIONS.map(m => (
              <button
                key={m}
                type="button"
                onClick={() => router.push(`/admin/analytics/ai-cost?months=${m}`)}
                className={cn(
                  'rounded-md px-3 py-1 text-sm font-medium transition-colors',
                  m === months ? 'bg-brand-600 text-white' : 'bg-muted/40 text-muted-foreground hover:bg-accent'
                )}
              >
                {m}개월
              </button>
            ))}
          </div>
        </div>
        <p className="admin-caption text-muted-foreground">
          실제 과금액은 제공자 콘솔 기준(여기선 한도 대비 소진율)
        </p>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold text-foreground">이번 달 한도 대비 사용률</CardTitle>
        </CardHeader>
        <CardContent>
          {currentUsage.every(u => u.used === 0) ? (
            <EmptyState />
          ) : (
            <div className="space-y-3">
              {currentUsage.map(u => (
                <div key={u.provider}>
                  <div className="mb-1 flex items-center justify-between admin-caption">
                    <span className="font-medium text-foreground">{u.provider}</span>
                    <span className="text-muted-foreground">
                      {u.keyCount === 0
                        ? '키 미설정'
                        : `${u.used.toLocaleString()} / ${u.limit.toLocaleString()} (${u.percent}%)`
                      }
                    </span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-muted/40">
                    <div
                      className={cn(
                        'h-full rounded-full',
                        u.percent >= 95 ? 'bg-destructive' : u.percent >= 80 ? 'bg-amber-500' : 'bg-brand-600'
                      )}
                      style={{ width: `${Math.min(u.percent, 100)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold text-foreground">월별 LLM 토큰 사용량</CardTitle>
        </CardHeader>
        <CardContent>
          {llmByMonth.length === 0 ? (
            <EmptyState />
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={stackedTokens} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="period" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip formatter={(v) => (v as number).toLocaleString()} />
                <Legend iconSize={10} wrapperStyle={{ fontSize: 12 }} />
                {providers.map(provider => (
                  <Bar key={provider} dataKey={provider} stackId="a" fill={PROVIDER_COLORS[provider] ?? CHART_MUTED} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-foreground">월별 번역 사용량 (자)</CardTitle>
          </CardHeader>
          <CardContent>
            {translationByMonth.every(r => r.chars === 0) ? (
              <EmptyState />
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={translationByMonth} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="period" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                  <Tooltip formatter={(v) => (v as number).toLocaleString()} />
                  <Line type="monotone" dataKey="chars" name="번역 문자수" stroke="var(--color-brand-600)" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-foreground">월별 TTS 사용량 (자)</CardTitle>
          </CardHeader>
          <CardContent>
            {ttsByMonth.every(r => r.chars === 0) ? (
              <EmptyState />
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={ttsByMonth} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="period" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                  <Tooltip formatter={(v) => (v as number).toLocaleString()} />
                  <Line type="monotone" dataKey="chars" name="TTS 문자수" stroke="var(--color-brand-600)" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
