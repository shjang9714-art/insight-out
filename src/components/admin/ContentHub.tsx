'use client'

import AdminContentManager from '@/components/admin/AdminContentManager'
import AdminContentAddDialog from '@/components/admin/AdminContentAddDialog'
import SourceManager from '@/components/admin/SourceManager'
import AdminTabShell from '@/components/admin/ui/AdminTabShell'
import { CATEGORY_SOURCE_TYPE } from '@/lib/admin/content-source-types'

const CONTENT_TABS = [
  { value: 'list', label: '발행 콘텐츠' },
  { value: 'sources', label: '소스' },
]

interface ContentHubProps {
  category?: string
}

export default function ContentHub({ category }: ContentHubProps) {
  const initialSourceType = category ? CATEGORY_SOURCE_TYPE[category] : undefined
  const tabs = initialSourceType ? CONTENT_TABS : []

  return (
    <AdminTabShell
      tabs={tabs}
      defaultTab="list"
      aria-label="콘텐츠 관리"
      actions={<AdminContentAddDialog />}
      renderContent={(tab) =>
        tab === 'sources'
          ? <SourceManager initialSelectedType={initialSourceType} />
          : <AdminContentManager />
      }
    />
  )
}
