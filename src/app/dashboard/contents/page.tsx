import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import PageContainer from '@/components/PageContainer'
import ContentsBoard from '@/components/contents/ContentsBoard'

type SearchParams = Promise<{ category?: string }>

export default async function ContentsPage({ searchParams }: { searchParams: SearchParams }) {
  const { category } = await searchParams

  if (category === '리서치') {
    redirect('/dashboard/reports?view=external')
  }

  return (
    <PageContainer>
      <Suspense fallback={<div className="p-6 text-sm text-muted-foreground">로딩 중...</div>}>
        <ContentsBoard />
      </Suspense>
    </PageContainer>
  )
}
