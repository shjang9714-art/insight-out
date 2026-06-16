'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'
import ReportUploadForm from '@/components/admin/ReportUploadForm'
import TextPasteForm from '@/components/admin/TextPasteForm'

type Tab = 'file' | 'paste'

export default function ContentAddTabs() {
  const [tab, setTab] = useState<Tab>('file')

  return (
    <div>
      <div className="mb-6 inline-flex rounded-lg border border-border bg-muted p-1 gap-1">
        <button
          type="button"
          onClick={() => setTab('file')}
          className={cn(
            'rounded-md px-4 py-1.5 text-sm font-medium transition-colors',
            tab === 'file'
              ? 'bg-brand-600 text-white shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          파일 업로드
        </button>
        <button
          type="button"
          onClick={() => setTab('paste')}
          className={cn(
            'rounded-md px-4 py-1.5 text-sm font-medium transition-colors',
            tab === 'paste'
              ? 'bg-brand-600 text-white shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          텍스트 붙여넣기
        </button>
      </div>

      {tab === 'file' ? <ReportUploadForm /> : <TextPasteForm />}
    </div>
  )
}
