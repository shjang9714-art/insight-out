'use client'

import AdminTabShell from '@/components/admin/ui/AdminTabShell'
import ReportUploadForm from '@/components/admin/ReportUploadForm'
import TextPasteForm from '@/components/admin/TextPasteForm'
import UrlImportForm from '@/components/admin/UrlImportForm'

const TABS = [
  { value: 'file',  label: '파일 업로드' },
  { value: 'paste', label: '텍스트 붙여넣기' },
  { value: 'url',   label: 'URL 가져오기' },
]

export default function ContentAddTabs() {
  return (
    <AdminTabShell
      tabs={TABS}
      defaultTab="file"
      aria-label="콘텐츠 추가 방식"
      renderContent={(tab) =>
        tab === 'file' ? <ReportUploadForm /> : tab === 'paste' ? <TextPasteForm /> : <UrlImportForm />
      }
    />
  )
}
