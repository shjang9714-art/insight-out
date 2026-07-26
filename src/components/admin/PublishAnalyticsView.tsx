'use client'

import { useRouter } from 'next/navigation'
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { CHART_MUTED } from '@/lib/admin/palette'
import type { PublishAnalytics } from '@/lib/admin/analytics'

const MONTH_OPTIONS = [3, 6, 12] as const

const SOURCE_COLORS: Record<string, string> = {
  strategyReports: '#4f86c6',
  briefings: '#f4a261',
  newsletters: '#57cc99',
  competitorWeekly: '#9b5de5',
}
const SOURCE_LABEL: Record<string, string> = {
  strategyReports: '전략보고서',
  briefings: '모닝브리핑',
  newsletters: '뉴스레터',
  competitorWeekly: '경쟁사 주간',
}

const SUCCESS_COLORS: Record<string, string> = {
  성공: '#57cc99',
  실패: '#e76f51',
}

function EmptyState() {
  return <p className="py-8 text-center text-sm text-muted-foreground">데이터 없음</p>
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-muted/20 p-4">
      <p className="admin-caption text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-semibold text-foreground">{value}</p>
    </div>
  )
}

function SuccessDonut({ title, completed, failed }: { title: string; completed: number; failed: number }) {
  const chart = [
    { name: '성공', value: completed },
    { name: '실패', value: failed },
  ]
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold text-foreground">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {completed + failed === 0 ? (
          <EmptyState />
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie data={chart} cx="50%" cy="50%" innerRadius={55} outerRadius={80} dataKey="value" nameKey="name">
                {chart.map(entry => (
                  <Cell key={entry.name} fill={SUCCESS_COLORS[entry.name] ?? CHART_MUTED} />
                ))}
              </Pie>
              <Tooltip formatter={(v) => (v as number).toLocaleString()} />
              <Legend iconSize={10} wrapperStyle={{ fontSize: 12 }} />
            </PieChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  )
}

export default function PublishAnalyticsView({ data, months }: { data: PublishAnalytics; months: number }) {
  const router = useRouter()
  const { byMonth, successRate, leadTime, newsletter } = data
  const sources = Object.keys(SOURCE_LABEL)

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
                onClick={() => router.push(`/admin/analytics/publish?months=${m}`)}
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
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold text-foreground">월별 발행량 추이</CardTitle>
        </CardHeader>
        <CardContent>
          {byMonth.every(row => sources.every(s => (row as unknown as Record<string, number>)[s] === 0)) ? (
            <EmptyState />
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={byMonth} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="period" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip formatter={(v) => (v as number).toLocaleString()} />
                <Legend
                  iconSize={10}
                  wrapperStyle={{ fontSize: 12 }}
                  formatter={(value) => SOURCE_LABEL[value as string] ?? value}
                />
                {sources.map(source => (
                  <Bar key={source} dataKey={source} stackId="a" name={SOURCE_LABEL[source]} fill={SOURCE_COLORS[source]} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <SuccessDonut title="전략보고서 생성 성공률" completed={successRate.strategy.completed} failed={successRate.strategy.failed} />
        <SuccessDonut title="모닝브리핑 생성 성공률" completed={successRate.briefings.ok} failed={successRate.briefings.failed} />
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold text-foreground">검수 리드타임 (생성→발행 평균)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <StatCard
              label="전략보고서"
              value={leadTime.strategyAvgHours === null ? '데이터 없음' : `${leadTime.strategyAvgHours.toLocaleString()}시간`}
            />
            <StatCard
              label="모닝브리핑"
              value={leadTime.briefingAvgHours === null ? '데이터 없음' : `${leadTime.briefingAvgHours.toLocaleString()}시간`}
            />
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-foreground">뉴스레터 월별 발송 건수</CardTitle>
          </CardHeader>
          <CardContent>
            {newsletter.every(r => r.issues === 0) ? (
              <EmptyState />
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={newsletter} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="period" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                  <Tooltip formatter={(v) => (v as number).toLocaleString()} />
                  <Bar dataKey="issues" name="발송 건수" fill={SOURCE_COLORS.newsletters} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-foreground">뉴스레터 월별 수신자수</CardTitle>
          </CardHeader>
          <CardContent>
            {newsletter.every(r => r.recipients === 0) ? (
              <EmptyState />
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={newsletter} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="period" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                  <Tooltip formatter={(v) => (v as number).toLocaleString()} />
                  <Line type="monotone" dataKey="recipients" name="수신자수" stroke="var(--color-brand-600)" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
