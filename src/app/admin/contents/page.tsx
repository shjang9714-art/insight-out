import type { Metadata } from 'next'
import { Suspense } from 'react'
import { Loader2 } from 'lucide-react'
import AdminContentManager from '@/components/admin/AdminContentManager'

export const metadata: Metadata = {
  title: '콘텐츠 관리 | 어드민 | Insight Out',
  description: '수집 콘텐츠의 게시 상태와 삭제를 관리합니다.',
}

export default function AdminContentsPage() {
  return (
    <>
      <div className="mb-6">
        <h1 className="text-xl font-bold text-foreground">콘텐츠 관리</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          수집된 콘텐츠를 검토하고 노출하거나 숨기거나 삭제합니다.
        </p>
      </div>
      <Suspense fallback={
        <div className="flex items-center justify-center py-16 text-sm text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          콘텐츠를 불러오는 중입니다.
        </div>
      }>
        <AdminContentManager />
      </Suspense>
    </>
  )
}
