import type { Metadata } from 'next'
import { Suspense } from 'react'
import { Loader2 } from 'lucide-react'
import ContentHub from '@/components/admin/ContentHub'

export const metadata: Metadata = {
  title: '콘텐츠 관리 | 어드민 | Insight Out',
  description: '수집 콘텐츠의 게시 상태와 삭제를 관리합니다.',
}

export default async function AdminContentsPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string }>
}) {
  const sp = await searchParams
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center py-16 text-sm text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        콘텐츠를 불러오는 중입니다.
      </div>
    }>
      <ContentHub key={sp.category ?? 'all'} category={sp.category} />
    </Suspense>
  )
}
