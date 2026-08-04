import { FileText } from 'lucide-react'
import ReportStyleCard from '@/components/reports/ReportStyleCard'
import type { AiReportBoardItem } from '@/lib/reports/ai-report-board'

/**
 * 지시서 2026-08-04c — 자료실 "AI 리포트" 탭 카드. 전략보고서(ai_reports)·
 * 지식보고서(contents category='지식보고서')를 한 목록에 섞어 보여주되,
 * kind별 배지("전략보고서"/"지식보고서")로만 구분한다(탭을 쪼개지 않음).
 */

function formatDate(iso: string): string {
  const d = new Date(iso)
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`
}

const KIND_LABEL = {
  strategy: '전략보고서',
  knowledge: '지식보고서',
} as const

const KIND_COVER = {
  strategy: 'from-blue-700 to-blue-900',
  knowledge: 'from-violet-700 to-violet-950',
} as const

const KIND_BADGE_CLASS = {
  strategy: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-900',
  knowledge: 'bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-950/40 dark:text-violet-300 dark:border-violet-900',
} as const

export default function AiReportBoardCard({ item }: { item: AiReportBoardItem }) {
  const isStrategy = item.kind === 'strategy'
  const href = isStrategy
    ? `/dashboard/reports/${item.id}`
    : `/dashboard/contents/${item.id}?category=${encodeURIComponent('지식보고서')}`

  return (
    <ReportStyleCard
      href={href}
      openInNewTab={!isStrategy}
      title={item.title}
      summary={item.summary}
      coverImageUrl={item.coverImageUrl}
      coverGradientClassName={KIND_COVER[item.kind]}
      Icon={FileText}
      wordmark={KIND_LABEL[item.kind]}
      showAiMark={isStrategy}
      badgeLabel={KIND_LABEL[item.kind]}
      badgeClassName={KIND_BADGE_CLASS[item.kind]}
      keywords={item.keywords}
      dateLabel={formatDate(item.dateIso)}
      publisher={item.publisher}
      ctaLabel="보고서 열기"
    />
  )
}
