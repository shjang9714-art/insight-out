import IssueDetailPage from '@/app/dashboard/issues/[id]/page'
import DetailSheet from '@/components/mobile/DetailSheet'

interface PageProps {
  params: Promise<{ id: string }>
}

export default function InterceptedIssueDetail({ params }: PageProps) {
  return (
    <DetailSheet titleFallback="신호 상세">
      <IssueDetailPage params={params} />
    </DetailSheet>
  )
}
