import Link from 'next/link'
import { ArrowRight, LineChart, Radar, Tags, Layers, FileText } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { AiReportType } from '@/lib/types'

/**
 * 349 — 전략보고서 카드 재설계.
 * 커버에 제목을 다시 쓰지 않는다(본문에 이미 있다 — 같은 문장이 카드에 두 번 나오면 정보량이 0이다).
 * 커버는 유형을 색으로 구분하는 표지 블록: 아이콘 + INSIGHT REPORT 워드마크.
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
}

export default function ReportCard({
  id, title, summary, coverImageUrl, publisher, publishedAt, type,
}: ReportCardProps) {
  const Icon = TYPE_ICON[type]

  return (
    <Link
      href={`/dashboard/reports/${id}`}
      prefetch={false}
      className="group flex h-full flex-col overflow-hidden rounded-2xl border border-border bg-card transition-all hover:border-brand-200 hover:shadow-[0_4px_20px_-6px_rgb(0_0_0/0.15)]"
    >
      {/* 표지 — 제목 없이 유형 색 + 아이콘 + 워드마크 */}
      <div className="relative aspect-[16/9] overflow-hidden bg-muted">
        {coverImageUrl ? (
          // next/image remotePatterns 미설정 → unoptimized(211 ContentCard 패턴)
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={coverImageUrl}
            alt=""
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
            loading="lazy"
          />
        ) : (
          <div
            aria-hidden
            className={`flex h-full w-full items-start justify-between bg-gradient-to-br ${TYPE_COVER[type]} p-4`}
          >
            <Icon className="h-6 w-6 text-white/80" strokeWidth={1.5} />
            <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/70">
              Insight Report
            </span>
          </div>
        )}
      </div>

      <div className="flex flex-1 flex-col p-5">
        <span className={`mb-2.5 w-fit rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${TYPE_BADGE_STYLE[type]}`}>
          {type}
        </span>

        <h3 className="mb-2 line-clamp-2 text-[17px] font-bold leading-[1.4] tracking-tight text-foreground transition-colors group-hover:text-brand-600">
          {title}
        </h3>

        {summary && (
          <p className="mb-3 line-clamp-2 text-[13px] leading-relaxed text-muted-foreground">
            {summary}
          </p>
        )}

        <div className="mt-auto flex items-center justify-between gap-2 text-[12px] text-muted-foreground">
          <span className="truncate">
            {formatDate(publishedAt)}
            {publisher && <> · {publisher}</>}
          </span>
          <span className="inline-flex shrink-0 items-center gap-0.5 font-medium text-foreground/70 transition-colors group-hover:text-brand-600">
            보고서 열기
            <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
          </span>
        </div>
      </div>
    </Link>
  )
}
