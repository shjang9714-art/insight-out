import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import AiMark from '@/components/ui/AiMark'

/**
 * 366 — 349에서 만든 AI 리포트 카드 시각 언어(그라디언트 커버 + 유형 픽토그램
 * + 워드마크 + 유형·키워드 칩 + CTA)를 content/AI리포트 공용으로 추출한 프레젠테이션 카드.
 * AiMark(358, AI 산출물 전용)는 showAiMark=true 인 호출부에서만 렌더된다.
 */

interface ReportStyleCardProps {
  href: string
  title: string
  summary: string | null
  coverImageUrl: string | null
  coverGradientClassName: string
  Icon: LucideIcon
  wordmark: string
  showAiMark?: boolean
  badgeLabel: string
  badgeClassName: string
  keywords: string[]
  keywordHrefBase?: string
  dateLabel: string
  publisher?: string | null
  ctaLabel?: string
  openInNewTab?: boolean
}

export default function ReportStyleCard({
  href,
  title,
  summary,
  coverImageUrl,
  coverGradientClassName,
  Icon,
  wordmark,
  showAiMark = false,
  badgeLabel,
  badgeClassName,
  keywords,
  keywordHrefBase = '/dashboard/keywords/',
  dateLabel,
  publisher,
  ctaLabel = '리포트 열기',
  openInNewTab = false,
}: ReportStyleCardProps) {
  const newTabProps = openInNewTab ? { target: '_blank' as const, rel: 'noopener noreferrer' } : {}
  return (
    <article className="group flex h-full flex-col overflow-hidden rounded-2xl border border-border bg-card transition-all hover:border-brand-200 hover:shadow-[0_4px_20px_-6px_rgb(0_0_0/0.15)]">
      {/* 표지 — 제목 없이 유형 색 + 아이콘 + 워드마크 */}
      <Link href={href} prefetch={false} {...newTabProps} className="relative block aspect-[21/9] overflow-hidden bg-muted">
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
            className={`relative flex h-full w-full bg-gradient-to-br ${coverGradientClassName} p-4`}
          >
            <Icon className="absolute left-1/2 top-1/2 h-20 w-20 -translate-x-1/2 -translate-y-1/2 text-white/25" strokeWidth={1.15} />
            <span className="ml-auto inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-white/70">
              {showAiMark && <AiMark size="sm" className="text-white/70" />}
              {wordmark}
            </span>
          </div>
        )}
      </Link>

      <div className="flex flex-1 flex-col p-5">
        <span className="mb-2.5 flex items-center gap-1.5">
          <span className={`w-fit rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${badgeClassName}`}>
            {badgeLabel}
          </span>
          {showAiMark && <AiMark size="sm" />}
        </span>

        <Link href={href} prefetch={false} {...newTabProps} className="mb-2">
          <h3 className="line-clamp-2 text-[17px] font-bold leading-[1.4] tracking-tight text-foreground transition-colors group-hover:text-brand-600">
            {title}
          </h3>
        </Link>

        {keywords.length > 0 && (
          <div className="mb-3 flex flex-wrap gap-1.5">
            {keywords.map((keyword) => (
              <Link
                key={keyword}
                href={`${keywordHrefBase}${encodeURIComponent(keyword)}`}
                prefetch={false}
                className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-brand-50 hover:text-brand-700 dark:hover:bg-brand-950/30 dark:hover:text-brand-300"
              >
                #{keyword}
              </Link>
            ))}
          </div>
        )}

        {summary && (
          <p className="mb-3 line-clamp-2 text-[13px] leading-relaxed text-muted-foreground">
            {summary}
          </p>
        )}

        <div className="mt-auto flex items-center justify-between gap-2 text-[12px] text-muted-foreground">
          <span className="truncate">
            {dateLabel}
            {publisher && <> · {publisher}</>}
          </span>
          <Link href={href} prefetch={false} {...newTabProps} className="inline-flex shrink-0 items-center gap-0.5 font-medium text-foreground/70 transition-colors group-hover:text-brand-600">
            {ctaLabel}
            <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
          </Link>
        </div>
      </div>
    </article>
  )
}
