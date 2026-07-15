'use client'

import {
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { KeywordDailyCount } from '@/lib/keywords/detail'

interface KeywordTrendChartProps {
  data: KeywordDailyCount[]
}

export default function KeywordTrendChart({ data }: KeywordTrendChartProps) {
  return (
    <ResponsiveContainer width="100%" height={240}>
      <LineChart data={data} margin={{ top: 8, right: 12, left: -24, bottom: 0 }}>
        <XAxis
          dataKey="date"
          tick={{ fontSize: 10, fill: 'var(--color-muted-foreground)' }}
          tickFormatter={(value: string) => value.slice(5)}
          minTickGap={24}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          tick={{ fontSize: 10, fill: 'var(--color-muted-foreground)' }}
          allowDecimals={false}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip
          formatter={(value) => [`${Number(value).toLocaleString()}건`, '관련 문서']}
          labelFormatter={(label) => `${String(label)} (KST)`}
          contentStyle={{
            background: 'var(--color-popover)',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-lg)',
            color: 'var(--color-popover-foreground)',
            fontSize: 12,
          }}
        />
        <Line
          type="monotone"
          dataKey="count"
          name="관련 문서"
          stroke="var(--color-brand-600)"
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 4, fill: 'var(--color-brand-600)' }}
        />
      </LineChart>
    </ResponsiveContainer>
  )
}
