import ContentDetailPage from '@/app/dashboard/contents/[id]/page'
import DetailSheet from '@/components/mobile/DetailSheet'

interface PageProps {
  params: Promise<{ id: string }>
  searchParams: Promise<{ origin?: string; view?: string }>
}

export default function InterceptedContentDetail({ params, searchParams }: PageProps) {
  return (
    <DetailSheet titleFallback="콘텐츠 상세">
      <ContentDetailPage params={params} searchParams={searchParams} />
    </DetailSheet>
  )
}
