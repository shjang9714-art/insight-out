import { FileText } from 'lucide-react'
import type { ContentCategory } from '@/lib/types'
import ReportStyleCard from '@/components/reports/ReportStyleCard'

/**
 * 366 — 지식보고서·외부 리포트 카드를 AI 리포트와 같은 시각 언어로 통일.
 * AiMark(358, AI 산출물 전용)는 여기선 절대 부착하지 않는다 — 워드마크·배지 문구로만 구분.
 */

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '발행일 미상'
  const d = new Date(dateStr)
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`
}

interface ContentReportCardProps {
  id: string
  title: string
  summary: string | null
  category: ContentCategory
  sourceName: string | null
  publishedAt: string | null
  coverImageUrl: string | null
  keywords: string[]
}

export default function ContentReportCard({
  id, title, summary, category, sourceName, publishedAt, coverImageUrl, keywords,
}: ContentReportCardProps) {
  const isKnowledge = category === '지식보고서'

  return (
    <ReportStyleCard
      href={`/dashboard/contents/${id}?category=${encodeURIComponent(category)}`}
      openInNewTab
      title={title}
      summary={summary}
      coverImageUrl={coverImageUrl}
      coverGradientClassName={isKnowledge ? 'from-violet-700 to-violet-950' : 'from-indigo-700 to-indigo-950'}
      Icon={FileText}
      wordmark={isKnowledge ? '지식보고서' : '외부 리포트'}
      badgeLabel={isKnowledge ? '지식보고서' : '외부 리포트'}
      badgeClassName={
        isKnowledge
          ? 'bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-950/40 dark:text-violet-300 dark:border-violet-900'
          : 'bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/40 dark:text-indigo-300 dark:border-indigo-900'
      }
      keywords={keywords.slice(0, 4)}
      dateLabel={formatDate(publishedAt)}
      publisher={sourceName}
      ctaLabel="리포트 열기"
    />
  )
}
