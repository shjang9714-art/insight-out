'use client'

import { useState } from 'react'
import AdminTabs from '@/components/admin/ui/AdminTabs'
import ReportUploadForm from '@/components/admin/ReportUploadForm'
import TextPasteForm from '@/components/admin/TextPasteForm'

type Tab = 'file' | 'paste'

const TABS = [
  { value: 'file',  label: '파일 업로드' },
  { value: 'paste', label: '텍스트 붙여넣기' },
]

export default function ContentAddTabs() {
  const [tab, setTab] = useState<Tab>('file')

  return (
    <div>
      <div className="mb-6">
        <AdminTabs items={TABS} value={tab} onChange={(v) => setTab(v as Tab)} aria-label="콘텐츠 추가 방식" />
      </div>

      {tab === 'file' ? <ReportUploadForm /> : <TextPasteForm />}
    </div>
  )
}
