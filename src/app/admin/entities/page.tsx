import type { Metadata } from 'next'
import EntityManager from '@/components/admin/EntityManager'
import AdminPageHeader from '@/components/admin/ui/AdminPageHeader'

export const metadata: Metadata = {
  title: '엔티티 사전 | 어드민 | Insight Out',
  description: '기업·기술·인물 등 엔티티 정규화·동의어 관리·중복 병합',
}

export default function EntitiesPage() {
  return (
    <div className="space-y-6">
      <AdminPageHeader />
      <EntityManager />
    </div>
  )
}
