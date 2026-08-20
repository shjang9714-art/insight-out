'use client'

import AdminTabShell from '@/components/admin/ui/AdminTabShell'
import BriefingManager from '@/components/admin/BriefingManager'
import PromptConsole from '@/components/admin/PromptConsole'

const TABS = [
  { value: 'list', label: '발행 목록' },
  { value: 'prompts', label: '프롬프트' },
]

export default function BriefingHub() {
  return (
    <AdminTabShell
      tabs={TABS}
      defaultTab="list"
      aria-label="모닝브리핑 관리"
      renderContent={(tab) => (
        tab === 'prompts'
          ? <PromptConsole keys={['briefing_script']} />
          : <BriefingManager />
      )}
    />
  )
}
