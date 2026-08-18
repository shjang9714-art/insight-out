import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import PageContainer from '@/components/PageContainer'
import PageHeader from '@/components/PageHeader'
import ContentsBoard from '@/components/contents/ContentsBoard'

type SearchParams = Promise<{ category?: string }>

export default async function ContentsPage({ searchParams }: { searchParams: SearchParams }) {
  const { category } = await searchParams

  if (category === '리서치') {
    redirect('/dashboard/reports?view=external')
  }

  return (
    <PageContainer>
      <PageHeader
        title="자료실"
        description="수집한 뉴스·리포트·영상 원문을 카테고리별로 모아 둔 자료 아카이브입니다."
      />
      <Suspense fallback={<div className="p-6 text-sm text-muted-foreground">로딩 중...</div>}>
        <ContentsBoard />
      </Suspense>
    </PageContainer>
  )
}
