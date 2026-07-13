import Link from 'next/link'
import type { AiReportType } from '@/lib/types'

const TYPE_BADGE_STYLE: Record<AiReportType, string> = {
  '시장동향':     'bg-blue-50 text-blue-700 border-blue-200',
  '경쟁사분석':   'bg-red-50 text-red-700 border-red-200',
  '키워드분석':   'bg-violet-50 text-violet-700 border-violet-200',
  '서비스리포트': 'bg-emerald-50 text-emerald-700 border-emerald-200',
  '자유주제':     'bg-muted text-muted-foreground border-border',
}

const TYPE_FALLBACK_BG: Record<AiReportType, string> = {
  '시장동향':     'from-blue-50 to-cyan-50 dark:from-blue-950/40 dark:to-cyan-950/30',
  '경쟁사분석':   'from-red-50 to-orange-50 dark:from-red-950/40 dark:to-orange-950/30',
  '키워드분석':   'from-violet-50 to-purple-50 dark:from-violet-950/40 dark:to-purple-950/30',
  '서비스리포트': 'from-emerald-50 to-teal-50 dark:from-emerald-950/40 dark:to-teal-950/30',
  '자유주제':     'from-muted to-muted',
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
  return (
    <Link
      href={`/dashboard/reports/${id}`}
      prefetch={false}
      className="group flex h-full flex-col overflow-hidden rounded-2xl border border-border bg-card transition-all hover:border-brand-200 hover:shadow-md"
    >
      <div className="aspect-[16/9] overflow-hidden bg-muted">
        {coverImageUrl ? (
          // next/image remotePatterns 미설정 → unoptimized로 빌드 에러 방지(211 ContentCard 패턴)
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={coverImageUrl}
            alt={title}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
            loading="lazy"
          />
        ) : (
          <div
            role="img"
            aria-label={title}
            className={`flex h-full w-full flex-col justify-between bg-gradient-to-br ${TYPE_FALLBACK_BG[type]} p-4`}
          >
            <span className="inline-flex w-fit rounded-full bg-background/70 px-2 py-0.5 text-[11px] font-semibold text-foreground backdrop-blur-sm dark:bg-background/40">
              {type}
            </span>
            <p className="line-clamp-3 text-sm font-bold leading-snug text-foreground">
              {title}
            </p>
          </div>
        )}
      </div>

      <div className="flex flex-1 flex-col p-4">
        <div className="mb-2">
          <span className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${TYPE_BADGE_STYLE[type]}`}>
            {type}
          </span>
        </div>

        <p className="mb-1.5 line-clamp-2 text-sm font-medium leading-snug text-foreground group-hover:text-brand-600">
          {title}
        </p>

        {summary && (
          <p className="mb-2 line-clamp-3 text-xs leading-relaxed text-muted-foreground">
            {summary}
          </p>
        )}

        <div className="mt-auto flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <span>{formatDate(publishedAt)}</span>
          {publisher && (
            <>
              <span>·</span>
              <span>{publisher}</span>
            </>
          )}
        </div>
      </div>
    </Link>
  )
}
