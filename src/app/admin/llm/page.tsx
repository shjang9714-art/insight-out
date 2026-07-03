import type { Metadata } from 'next'
import LlmManager from '@/components/admin/LlmManager'
import AdminPageHeader from '@/components/admin/ui/AdminPageHeader'

export const metadata: Metadata = {
  title: 'LLM 관리 | Insight Out 어드민',
  description: 'LLM 연동 현황·사용량·라우팅 관리',
}

export default function LlmAdminPage() {
  return (
    <div className="space-y-6">
      <AdminPageHeader />
      <LlmManager />
    </div>
  )
}
