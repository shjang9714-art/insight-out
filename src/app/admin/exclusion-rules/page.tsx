import type { Metadata } from 'next'
import ExclusionRulesManager from '@/components/admin/ExclusionRulesManager'
import AdminPageHeader from '@/components/admin/ui/AdminPageHeader'

export const metadata: Metadata = {
  title: '제외 규칙 | 어드민 | Insight Out',
  description: '도메인·URL·제목 패턴으로 저품질 재유입을 자동 보류/거부',
}

export default function AdminExclusionRulesPage() {
  return (
    <>
      <AdminPageHeader />
      <ExclusionRulesManager />
    </>
  )
}
