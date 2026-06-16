'use client'

import { useRouter } from 'next/navigation'
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

// ─── 타입 ─────────────────────────────────────────────────────────────────────

export interface DayTrend {
  date: string
  뉴스: number
  리포트: number
  웹인사이트: number
  유튜브: number
  'AI보고서': number
}

export interface ChartData {
  categoryDist: { name: string; value: number }[]
  todayCategoryDist: { name: string; value: number }[]
  statusDist: { name: string; value: number }[]
  dayTrend: DayTrend[]
  sourceTop: { sourceId: string; name: string; count: number }[]
}

// ─── 팔레트 ───────────────────────────────────────────────────────────────────

const CAT_COLORS: Record<string, string> = {
  뉴스:     '#4f86c6',
  리포트:   '#f4a261',
  웹인사이트: '#57cc99',
  유튜브:   '#e76f51',
  'AI보고서': '#9b5de5',
}

const STATUS_COLORS: Record<string, string> = {
  게시됨:    '#57cc99',
  '검토 대기': '#f4a261',
  반려됨:    '#e76f51',
}

const CATEGORIES = ['뉴스', '리포트', '웹인사이트', '유튜브', 'AI보고서'] as const

// ─── 컴포넌트 ─────────────────────────────────────────────────────────────────

export function DashboardCharts({ chartData }: { chartData: ChartData }) {
  const router = useRouter()
  const { categoryDist, statusDist, dayTrend, sourceTop } = chartData

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {/* ① 카테고리 분포 도넛 */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold text-foreground">카테고리 분포</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={240}>
            <PieChart>
              <Pie
                data={categoryDist}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={90}
                dataKey="value"
                nameKey="name"
                cursor="pointer"
                onClick={(entry: { name?: string }) => {
                  if (entry.name) router.push(`/admin/contents?category=${encodeURIComponent(entry.name)}`)
                }}
              >
                {categoryDist.map((entry) => (
                  <Cell key={entry.name} fill={CAT_COLORS[entry.name] ?? '#94a3b8'} />
                ))}
              </Pie>
              <Tooltip formatter={(v) => (v as number).toLocaleString()} />
              <Legend iconSize={10} wrapperStyle={{ fontSize: 12 }} />
            </PieChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* ② 상태 분포 */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold text-foreground">상태 분포</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={240}>
            <PieChart>
              <Pie
                data={statusDist}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={90}
                dataKey="value"
                nameKey="name"
                cursor="pointer"
                onClick={(entry: { name?: string }) => {
                  const statusMap: Record<string, string> = {
                    게시됨: 'published',
                    '검토 대기': 'pending',
                    반려됨: 'rejected',
                  }
                  const s = entry.name ? statusMap[entry.name] : undefined
                  if (s) router.push(`/admin/contents?status=${s}`)
                }}
              >
                {statusDist.map((entry) => (
                  <Cell key={entry.name} fill={STATUS_COLORS[entry.name] ?? '#94a3b8'} />
                ))}
              </Pie>
              <Tooltip formatter={(v) => (v as number).toLocaleString()} />
              <Legend iconSize={10} wrapperStyle={{ fontSize: 12 }} />
            </PieChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* ③ 최근 14일 수집 추이 (스택 바) */}
      <Card className="lg:col-span-2">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold text-foreground">최근 14일 수집 추이</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={dayTrend} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
              <Tooltip formatter={(v) => (v as number).toLocaleString()} />
              <Legend iconSize={10} wrapperStyle={{ fontSize: 12 }} />
              {CATEGORIES.map((cat) => (
                <Bar
                  key={cat}
                  dataKey={cat}
                  stackId="a"
                  fill={CAT_COLORS[cat]}
                  cursor="pointer"
                  onClick={() =>
                    router.push(`/admin/contents?category=${encodeURIComponent(cat)}`)
                  }
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* ④ 소스 Top 10 (가로 바) */}
      <Card className="lg:col-span-2">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold text-foreground">소스 기여 Top 10 (최근 30일)</CardTitle>
        </CardHeader>
        <CardContent>
          {sourceTop.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">데이터 없음</p>
          ) : (
            <ResponsiveContainer width="100%" height={Math.max(200, sourceTop.length * 36)}>
              <BarChart
                data={sourceTop}
                layout="vertical"
                margin={{ top: 4, right: 24, bottom: 4, left: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} />
                <YAxis
                  dataKey="name"
                  type="category"
                  tick={{ fontSize: 11 }}
                  width={130}
                />
                <Tooltip formatter={(v) => (v as number).toLocaleString()} />
                <Bar
                  dataKey="count"
                  name="수집 건수"
                  fill={CAT_COLORS['뉴스']}
                  cursor="pointer"
                  onClick={(d: unknown) => {
                    const entry = d as { sourceId?: string }
                    if (entry.sourceId) router.push(`/admin/contents?source=${encodeURIComponent(entry.sourceId)}`)
                  }}
                />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
