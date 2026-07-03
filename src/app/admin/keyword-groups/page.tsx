import type { Metadata } from 'next'
import KeywordGroupManager from '@/components/admin/KeywordGroupManager'
import AdminPageHeader from '@/components/admin/ui/AdminPageHeader'

export const metadata: Metadata = {
  title: '수집 키워드 | 어드민 | Insight Out',
  description: '수집 관련도·검색어·시그널 기준을 정의합니다.',
}

export default function KeywordGroupsPage() {
  return (
    <div className="space-y-6">
      <AdminPageHeader />
      <KeywordGroupManager />
    </div>
  )
}
