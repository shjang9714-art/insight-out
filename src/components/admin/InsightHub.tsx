'use client'

import AdminTabShell from '@/components/admin/ui/AdminTabShell'
import InsightCardsManager from '@/components/admin/InsightCardsManager'
import IssueManager from '@/components/admin/IssueManager'
import DailyInsightsManager from '@/components/admin/DailyInsightsManager'

const TABS = [
  { value: 'card',  label: '인사이트 카드' },
  { value: 'issue', label: '이슈 관리' },
  { value: 'daily', label: '일일 핵심' },
]

export default function InsightHub() {
  return (
    <AdminTabShell
      tabs={TABS}
      defaultTab="card"
      aria-label="핵심인사이트 관리"
      renderContent={(tab) =>
        tab === 'card'
          ? <InsightCardsManager />
          : tab === 'issue'
            ? <div className="space-y-6"><IssueManager /></div>
            : <div className="space-y-6"><DailyInsightsManager /></div>
      }
    />
  )
}
