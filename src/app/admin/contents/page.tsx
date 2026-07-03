import type { Metadata } from 'next'
import { Suspense } from 'react'
import { Loader2 } from 'lucide-react'
import AdminContentManager from '@/components/admin/AdminContentManager'
import AdminPageHeader from '@/components/admin/ui/AdminPageHeader'

export const metadata: Metadata = {
  title: '콘텐츠 관리 | 어드민 | Insight Out',
  description: '수집 콘텐츠의 게시 상태와 삭제를 관리합니다.',
}

export default function AdminContentsPage() {
  return (
    <>
      <AdminPageHeader />
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
