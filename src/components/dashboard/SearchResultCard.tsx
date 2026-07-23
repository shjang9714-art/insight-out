import Link from 'next/link'

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
  /** 카테고리·유형 등 자료 종류 배지 옆에 추가로 붙일 작은 배지(선택) */
  subBadge?: string | null
}

export default function SearchResultCard({ href, title, excerpt, publishedAt, typeBadge, subBadge }: Props) {
  const dateStr = formatDate(publishedAt)

  return (
    <article className="group rounded-xl border border-border bg-card px-5 py-4 shadow-sm transition-all hover:border-brand-200 hover:shadow-md">
      <Link href={href} prefetch={false} className="block min-w-0">
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className={`shrink-0 rounded-md px-2 py-0.5 text-[11px] font-semibold ${typeBadge.className}`}>
              {typeBadge.label}
            </span>
            {subBadge && (
              <span className="shrink-0 rounded-md bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
                {subBadge}
              </span>
            )}
          </div>

          <p className="line-clamp-1 text-sm font-semibold leading-snug text-foreground transition-colors group-hover:text-brand-600">
            {title}
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
