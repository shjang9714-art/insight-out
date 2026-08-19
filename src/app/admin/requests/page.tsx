import type { Metadata } from 'next'
import RequestsBoard from '@/components/admin/RequestsBoard'
import AdminPageHeader from '@/components/admin/ui/AdminPageHeader'

export const metadata: Metadata = {
  title: '운영 게시판 | 어드민 | Insight Out',
  description: 'SQL·인프라 요청과 팀 핸드오프, 공지 추적',
}

export default function AdminRequestsPage() {
  return (
    <>
      <AdminPageHeader
        titleOverride="운영 게시판"
        descriptionOverride="운영 요청, 작업 메모, 공지, 핸드오프를 관리합니다."
      />
      <RequestsBoard />
    </>
  )
}
