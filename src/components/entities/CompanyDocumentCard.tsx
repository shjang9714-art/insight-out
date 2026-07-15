import { Building2 } from 'lucide-react'
import ReportStyleCard from '@/components/reports/ReportStyleCard'
import type { CompanyDocumentListItem } from '@/lib/company-docs/query'

/** 355-B — 기업동향 > 기업·기술 자료 탭 카드. ReportStyleCard(366) 시각 언어 재사용, 톤은 앰버로 구분. */

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '발행일 미상'
  const d = new Date(dateStr)
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`
}

export default function CompanyDocumentCard({ doc }: { doc: CompanyDocumentListItem }) {
  return (
    <ReportStyleCard
      href={`/dashboard/contents/${doc.contentId}`}
      title={doc.title}
      summary={doc.summaryKo}
      coverImageUrl={doc.thumbnailUrl}
      coverGradientClassName="from-amber-700 to-amber-950"
      Icon={Building2}
      wordmark={doc.entityName ?? '기업자료'}
      badgeLabel={doc.docType}
      badgeClassName="bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900"
      keywords={[]}
      dateLabel={formatDate(doc.publishedAt)}
      publisher={doc.isOfficial ? '공식자료' : null}
      ctaLabel="자료 열기"
    />
  )
}
