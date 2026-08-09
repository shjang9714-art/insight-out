import Link from 'next/link'
import { highlightMatches } from '@/lib/search/highlight'

function formatDate(d: string | null) {
  if (!d) return null
  return new Date(d).toLocaleDateString('ko-KR', {
    timeZone: 'Asia/Seoul',
    month: 'short',
    day: 'numeric',
  })
}

interface Props {
  href: string
  title: string
  excerpt: string | null
  publishedAt: string | null
  typeBadge: { label: string; className: string }
  /** 있으면 title에서 이 검색어와 일치하는 부분을 <mark>로 강조(통합검색 오버레이 전용) */
  highlightQuery?: string
}

export default function SearchResultCard({ href, title, excerpt, publishedAt, typeBadge, highlightQuery }: Props) {
  const dateStr = formatDate(publishedAt)

  return (
    <article className="group rounded-xl border border-border bg-card px-5 py-4 shadow-sm transition-all hover:border-brand-200 hover:shadow-md">
      <Link href={href} prefetch={false} className="block min-w-0">
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className={`shrink-0 rounded-md px-2 py-0.5 text-[11px] font-semibold ${typeBadge.className}`}>
              {typeBadge.label}
            </span>
          </div>

          <p className="line-clamp-1 text-sm font-semibold leading-snug text-foreground transition-colors group-hover:text-brand-600">
            {highlightQuery ? highlightMatches(title, highlightQuery) : title}
          </p>

          {excerpt && (
            <p className="line-clamp-1 text-xs leading-relaxed text-muted-foreground">
              {excerpt}
            </p>
          )}

          <p className="text-[11px] text-muted-foreground">
            {dateStr ? `발행 ${dateStr}` : '발행일 미상'}
          </p>
        </div>
      </Link>
    </article>
  )
}
