import type { Metadata } from 'next'
import SourceManager from '@/components/admin/SourceManager'
import AdminPageHeader from '@/components/admin/ui/AdminPageHeader'

export const metadata: Metadata = {
  title: '소스 관리 | 어드민 | Insight Out',
  description: '크롤링 소스(뉴스 피드, 리포트 발행처 등) 추가·수정·삭제·활성 관리',
}

export default function AdminSourcesPage() {
  return (
    <>
      <AdminPageHeader />
      <SourceManager />
    </>
  )
}
