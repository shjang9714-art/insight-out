import type { Metadata } from 'next'
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
          수집된 콘텐츠를 검토하고 승인·반려하거나 삭제합니다.
        </p>
      </div>
      <AdminContentManager />
    </>
  )
}
