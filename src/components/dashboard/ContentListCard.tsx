import Link from 'next/link'
import { ExternalLink, FileText } from 'lucide-react'
import { CONTENT_CATEGORY_LABEL, type ContentCategory } from '@/lib/types'

function formatDate(d: string | null) {
  if (!d) return null
  return new Date(d).toLocaleDateString('ko-KR', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

interface ContentListCardProps {
  id: string
  title: string
  excerpt: string | null
  category: ContentCategory
  publishedAt: string | null
  originalUrl: string | null
  filePath: string | null
  isEditorPick: boolean
  author: string | null
  sourceName: string | null
  tags: string[]
}

export default function ContentListCard({
  id,
  title,
  excerpt,
  category,
  publishedAt,
  originalUrl,
  filePath,
  isEditorPick,
  author,
  sourceName,
  tags,
}: ContentListCardProps) {
  const dateStr   = formatDate(publishedAt)
  const isYoutube = category === '유튜브'

  const inner = (
    <div className="flex h-full flex-col p-5">
      {/* 상단: 카테고리 배지 + 해시태그 + 에디터픽 */}
      <div className="mb-3 flex flex-wrap items-center gap-1">
        <span className="rounded-md bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
          {CONTENT_CATEGORY_LABEL[category] ?? category}
        </span>
        {tags.map((kw) => (
          <span
            key={kw}
            className="rounded-full bg-brand-50 px-2 py-0.5 text-[11px] font-medium text-brand-700 dark:bg-brand-950/30 dark:text-brand-300"
          >
            #{kw}
          </span>
        ))}
        {isEditorPick && (
          <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
            ⭐ 에디터 픽
          </span>
        )}
      </div>

      {/* 제목 */}
      <h2 className="mb-2.5 line-clamp-2 text-[15px] font-bold leading-snug text-foreground transition-colors group-hover:text-brand-600">
        {title}
      </h2>

      {/* 요약 발췌 */}
      <p className="mb-4 line-clamp-3 flex-1 text-[13px] leading-relaxed text-foreground/70 dark:text-foreground/60">
        {excerpt ?? '요약 정보가 없습니다.'}
      </p>

      {/* 풋터: 메타 + 액션 */}
      <div className="mt-auto flex items-center justify-between gap-2 border-t border-border/60 pt-3">
        <p className="truncate text-[11px] text-muted-foreground">
          {[sourceName ?? author, dateStr ? `발행 ${dateStr}` : '발행일 미상']
            .filter(Boolean)
            .join(' · ')}
        </p>
        {originalUrl && (
          <a
            href={originalUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="shrink-0 flex items-center gap-1 rounded-lg border border-border bg-background px-2.5 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:border-brand-600 hover:text-brand-600"
          >
            <ExternalLink className="h-3 w-3" />
            원문
          </a>
        )}
        {!originalUrl && filePath && (
          <span className="shrink-0 flex items-center gap-1 rounded-lg border border-border bg-muted px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
            <FileText className="h-3 w-3" />
            리포트
          </span>
        )}
      </div>
    </div>
  )

  const cardClass =
    'group flex flex-col rounded-2xl border border-border bg-card shadow-sm transition-all hover:border-brand-200 hover:shadow-md'

  if (isYoutube) {
    return <article className={cardClass}>{inner}</article>
  }

  return (
    <Link href={`/dashboard/contents/${id}`} className={cardClass}>
      <article className="h-full">{inner}</article>
    </Link>
  )
}
