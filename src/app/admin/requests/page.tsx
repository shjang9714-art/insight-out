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
      <AdminPageHeader />
      <RequestsBoard />
    </>
  )
}
