import type { Metadata } from 'next'
import ContentAddTabs from '@/components/admin/ContentAddTabs'

export const metadata: Metadata = {
  title: '콘텐츠 추가 | 어드민 | Insight Out',
  description: '파일 업로드 또는 텍스트 붙여넣기로 콘텐츠를 수동 등록합니다.',
}

export default function AdminUploadPage() {
  return (
    <>
      <div className="mb-6">
        <h1 className="text-xl font-bold text-foreground">콘텐츠 추가</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          파일 업로드 또는 텍스트 붙여넣기로 콘텐츠를 수동 등록합니다.
        </p>
      </div>
      <ContentAddTabs />
    </>
  )
}
