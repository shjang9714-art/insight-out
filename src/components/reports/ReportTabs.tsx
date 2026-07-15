import InsightViewTabs from '@/components/analysis/InsightViewTabs'
import NavGroupAlign from '@/components/dashboard/NavGroupAlign'

export const REPORT_TABS = [
  { id: 'ai', label: 'AI 리포트', href: '/dashboard/reports?view=ai' },
  { id: 'external', label: '외부 리포트', href: '/dashboard/reports?view=external' },
  { id: 'knowledge', label: '지식보고서', href: '/dashboard/reports?view=knowledge' },
] as const

export type ReportViewId = (typeof REPORT_TABS)[number]['id']

interface ReportTabsProps {
  value: ReportViewId
  className?: string
}

export default function ReportTabs({ value, className }: ReportTabsProps) {
  return (
    <NavGroupAlign className={className ?? '-mt-3 mb-6'}>
      <InsightViewTabs items={[...REPORT_TABS]} value={value} />
    </NavGroupAlign>
  )
}
