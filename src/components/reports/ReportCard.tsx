import { LineChart, Radar, Tags, Layers, FileText } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { AiReportType } from '@/lib/types'
import ReportStyleCard from '@/components/reports/ReportStyleCard'

/**
 * 349 — AI 리포트 카드 재설계.
 * 커버에 제목을 다시 쓰지 않는다(본문에 이미 있다 — 같은 문장이 카드에 두 번 나오면 정보량이 0이다).
 * 커버는 유형을 색으로 구분하는 표지 블록: 아이콘 + AI REPORT 워드마크.
 * 366 — 시각 언어는 ReportStyleCard로 추출(content/AI리포트 공용). 여기선 유형별 설정만.
 */

const TYPE_COVER: Record<AiReportType, string> = {
  '시장동향':     'from-blue-700 to-blue-900',
  '경쟁사분석':   'from-rose-800 to-slate-900',
  '키워드분석':   'from-violet-700 to-violet-950',
  '서비스리포트': 'from-emerald-700 to-teal-900',
  '자유주제':     'from-slate-600 to-slate-800',
}

const TYPE_ICON: Record<AiReportType, LucideIcon> = {
  '시장동향':     LineChart,
  '경쟁사분석':   Radar,
  '키워드분석':   Tags,
  '서비스리포트': Layers,
  '자유주제':     FileText,
}

const TYPE_BADGE_STYLE: Record<AiReportType, string> = {
  '시장동향':     'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-900',
  '경쟁사분석':   'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-900',
  '키워드분석':   'bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-950/40 dark:text-violet-300 dark:border-violet-900',
  '서비스리포트': 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900',
  '자유주제':     'bg-muted text-muted-foreground border-border',
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`
}

interface ReportCardProps {
  id: string
  title: string
  summary: string | null
  coverImageUrl: string | null
  publisher: string | null
  publishedAt: string
  type: AiReportType
  keywords: string[]
}

export default function ReportCard({
  id, title, summary, coverImageUrl, publisher, publishedAt, type, keywords,
}: ReportCardProps) {
  return (
    <ReportStyleCard
      href={`/dashboard/reports/${id}`}
      title={title}
      summary={summary}
      coverImageUrl={coverImageUrl}
      coverGradientClassName={TYPE_COVER[type]}
      Icon={TYPE_ICON[type]}
      wordmark="AI Report"
      showAiMark
      badgeLabel={type}
      badgeClassName={TYPE_BADGE_STYLE[type]}
      keywords={keywords}
      dateLabel={formatDate(publishedAt)}
      publisher={publisher}
      ctaLabel="보고서 열기"
    />
  )
}
