import EntityDetailPage from '@/app/dashboard/entities/[id]/page'
import DetailSheet from '@/components/mobile/DetailSheet'

interface PageProps {
  params: Promise<{ id: string }>
  searchParams: Promise<{ origin?: string; view?: string }>
}

export default function InterceptedEntityDetail({ params, searchParams }: PageProps) {
  return (
    <DetailSheet titleFallback="기업 상세">
      <EntityDetailPage params={params} searchParams={searchParams} />
    </DetailSheet>
  )
}
