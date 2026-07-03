import type { Metadata } from 'next'
import ContentAddTabs from '@/components/admin/ContentAddTabs'
import AdminPageHeader from '@/components/admin/ui/AdminPageHeader'

export const metadata: Metadata = {
  title: '콘텐츠 추가 | 어드민 | Insight Out',
  description: '파일 업로드 또는 텍스트 붙여넣기로 콘텐츠를 수동 등록합니다.',
}

export default function AdminUploadPage() {
  return (
    <>
      <AdminPageHeader />
      <ContentAddTabs />
    </>
  )
}
