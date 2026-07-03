import type { Metadata } from 'next'
import BriefingManager from '@/components/admin/BriefingManager'
import AdminPageHeader from '@/components/admin/ui/AdminPageHeader'

export const metadata: Metadata = {
  title: '모닝브리핑 | 어드민 | Insight Out',
  description: '모닝브리핑 목록, 스크립트 확인, 오디오 생성, 승인을 관리합니다.',
}

export default function AdminBriefingsPage() {
  return (
    <div className="space-y-6">
      <AdminPageHeader />
      <BriefingManager />
    </div>
  )
}
