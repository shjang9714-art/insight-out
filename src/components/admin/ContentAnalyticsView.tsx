'use client'

import { useRouter } from 'next/navigation'
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
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
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { CHART_CATEGORY, CHART_STATUS, CHART_MUTED } from '@/lib/admin/palette'
import type { ContentAnalytics } from '@/lib/admin/analytics'

const STATUS_LABEL: Record<string, string> = {
  published: '게시됨',
  pending: '검토 대기',
  rejected: '반려됨',
}

const DAY_OPTIONS = [7, 30, 90] as const

function EmptyState() {
  return <p className="py-8 text-center text-sm text-muted-foreground">데이터 없음</p>
}

export default function ContentAnalyticsView({ data }: { data: ContentAnalytics }) {
  const router = useRouter()
  const { windowDays, daily, byCategory, byStatus, topSources, topBookmarked, totalInWindow, truncated } = data

  const statusChart = byStatus.map(s => ({ name: STATUS_LABEL[s.status] ?? s.status, value: s.count, status: s.status }))
  const categoryChart = byCategory.map(c => ({ name: c.category, value: c.count }))

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <span className="admin-caption text-muted-foreground">기간</span>
          <div className="flex gap-1">
            {DAY_OPTIONS.map(d => (
              <button
                key={d}
                type="button"
                onClick={() => router.push(`/admin/analytics/content?days=${d}`)}
                className={cn(
                  'rounded-md px-3 py-1 text-sm font-medium transition-colors',
                  d === windowDays ? 'bg-brand-600 text-white' : 'bg-muted/40 text-muted-foreground hover:bg-accent'
                )}
              >
                {d}일
              </button>
            ))}
          </div>
        </div>
        <p className="admin-caption text-muted-foreground">
          최근 {windowDays}일 총 {totalInWindow.toLocaleString()}건
          {truncated && <Badge variant="secondary" className="ml-2">표본 상한 도달 — 근사치</Badge>}
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-foreground">일별 수집 추이</CardTitle>
          </CardHeader>
          <CardContent>
            {daily.length === 0 ? (
              <EmptyState />
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={daily} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={(v: string) => v.slice(5)} minTickGap={24} />
                  <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                  <Tooltip formatter={(v) => (v as number).toLocaleString()} labelFormatter={(l) => String(l)} />
                  <Line type="monotone" dataKey="count" name="수집 건수" stroke="var(--color-brand-600)" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-foreground">카테고리 분포</CardTitle>
          </CardHeader>
          <CardContent>
            {categoryChart.every(c => c.value === 0) ? (
              <EmptyState />
            ) : (
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={categoryChart} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                  <Tooltip formatter={(v) => (v as number).toLocaleString()} />
                  <Bar
                    dataKey="value"
                    cursor="pointer"
                    onClick={(entry: unknown) => {
                      const name = (entry as { name?: string }).name
                      if (name) router.push(`/admin/contents?category=${encodeURIComponent(name)}`)
                    }}
                  >
                    {categoryChart.map(entry => (
                      <Cell key={entry.name} fill={CHART_CATEGORY[entry.name] ?? CHART_MUTED} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-foreground">상태 비율</CardTitle>
          </CardHeader>
          <CardContent>
            {statusChart.every(s => s.value === 0) ? (
              <EmptyState />
            ) : (
              <ResponsiveContainer width="100%" height={240}>
                <PieChart>
                  <Pie
                    data={statusChart}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={90}
                    dataKey="value"
                    nameKey="name"
                    cursor="pointer"
                    onClick={(d: unknown) => {
                      const status = (d as { status?: string }).status
                      if (status) router.push(`/admin/contents?status=${status}`)
                    }}
                  >
                    {statusChart.map(entry => (
                      <Cell key={entry.name} fill={CHART_STATUS[entry.name] ?? CHART_MUTED} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v) => (v as number).toLocaleString()} />
                  <Legend iconSize={10} wrapperStyle={{ fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-foreground">소스 기여 Top 10</CardTitle>
          </CardHeader>
          <CardContent>
            {topSources.length === 0 ? (
              <EmptyState />
            ) : (
              <ResponsiveContainer width="100%" height={Math.max(200, topSources.length * 36)}>
                <BarChart data={topSources} layout="vertical" margin={{ top: 4, right: 24, bottom: 4, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} />
                  <YAxis dataKey="name" type="category" tick={{ fontSize: 11 }} width={130} />
                  <Tooltip formatter={(v) => (v as number).toLocaleString()} />
                  <Bar dataKey="count" name="수집 건수" fill={CHART_CATEGORY['뉴스']} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-foreground">북마크 Top 10</CardTitle>
          </CardHeader>
          <CardContent>
            {topBookmarked.length === 0 ? (
              <EmptyState />
            ) : (
              <div className="divide-y divide-border">
                {topBookmarked.map((item, i) => (
                  <div key={item.id} className="flex items-center gap-3 py-2">
                    <span className="w-5 shrink-0 text-right admin-caption text-muted-foreground">{i + 1}</span>
                    <span className="min-w-0 flex-1 truncate text-sm text-foreground">{item.title}</span>
                    <span className="shrink-0 admin-caption font-medium tabular-nums text-muted-foreground">
                      {item.bookmark_count.toLocaleString()}건
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
