'use client'

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts'

export interface SentimentDay {
  date: string   // YYYY-MM-DD
  긍정: number
  중립: number
  부정: number
}

interface Props {
  data: SentimentDay[]
  trend: '개선' | '악화' | '유지'
}

const TREND_STYLE: Record<Props['trend'], string> = {
  개선: 'text-positive',
  악화: 'text-negative',
  유지: 'text-muted-foreground',
}

export default function IssueSentimentTrend({ data, trend }: Props) {
  if (data.length <= 1) return null

  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        <h2 className="text-sm font-semibold text-foreground">논조 추세</h2>
        <span className={`text-xs font-medium ${TREND_STYLE[trend]}`}>{trend}</span>
      </div>
      <ResponsiveContainer width="100%" height={160}>
        <BarChart data={data} margin={{ top: 0, right: 0, left: -24, bottom: 0 }}>
          <XAxis
            dataKey="date"
            tick={{ fontSize: 10, fill: 'var(--color-muted-foreground, #888)' }}
            tickFormatter={(v: string) => v.slice(5)}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tick={{ fontSize: 10, fill: 'var(--color-muted-foreground, #888)' }}
            allowDecimals={false}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            contentStyle={{ fontSize: 12, borderRadius: 8 }}
            itemStyle={{ padding: '1px 0' }}
          />
          <Legend wrapperStyle={{ fontSize: 11, paddingTop: 4 }} />
          <Bar dataKey="긍정" stackId="a" fill="var(--color-positive)" radius={[0, 0, 0, 0]} />
          <Bar dataKey="중립" stackId="a" fill="var(--color-muted-foreground)" radius={[0, 0, 0, 0]} />
          <Bar dataKey="부정" stackId="a" fill="var(--color-negative)" radius={[2, 2, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
