import type { Metadata } from 'next'
import ReportUploadForm from '@/components/admin/ReportUploadForm'

export const metadata: Metadata = {
  title: '리포트 업로드 | 어드민 | Insight Out',
  description: '가트너, KRG, 웹인사이트 리서치 리포트 파일 업로드',
}

export default function AdminUploadPage() {
  return (
    <>
      <div className="mb-6">
        <h1 className="text-xl font-bold text-gray-900">리포트 업로드</h1>
        <p className="mt-1 text-sm text-gray-500">
          가트너, KRG, 웹인사이트 등 리서치 리포트를 업로드합니다.
          PDF · PPTX · DOCX · XLSX 지원, 파일당 최대 50 MB.
        </p>
      </div>
      <ReportUploadForm />
    </>
  )
}
