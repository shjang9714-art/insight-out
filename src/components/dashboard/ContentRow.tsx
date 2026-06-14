import Link from 'next/link'
import { ExternalLink, FileText } from 'lucide-react'
import { CONTENT_CATEGORY_LABEL, type ContentCategory } from '@/lib/types'
import { toExcerpt } from '@/lib/contents/excerpt'

const CATEGORY_STYLE: Partial<Record<ContentCategory, string>> = {
  '뉴스':      'bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300',
  '리포트':    'bg-purple-50 text-purple-700 dark:bg-purple-950/40 dark:text-purple-300',
  '웹인사이트': 'bg-teal-50 text-teal-700 dark:bg-teal-950/40 dark:text-teal-300',
  'AI보고서':  'bg-pink-50 text-pink-700 dark:bg-pink-950/40 dark:text-pink-300',
  '유튜브':    'bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300',
  // deprecated
  '가트너':    'bg-purple-50 text-purple-700 dark:bg-purple-950/40 dark:text-purple-300',
  'KRG':      'bg-orange-50 text-orange-700 dark:bg-orange-950/40 dark:text-orange-300',
  '오피니언':  'bg-green-50 text-green-700 dark:bg-green-950/40 dark:text-green-300',
  '뉴스레터':  'bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300',
}

function formatDate(d: string | null) {
  if (!d) return null
  return new Date(d).toLocaleDateString('ko-KR', {
    timeZone: 'Asia/Seoul',
    month: 'short',
    day: 'numeric',
  })
}

interface Props {
  id: string
  title: string
  summaryKo: string | null
  bodyOriginal?: string | null
  category: ContentCategory
  publishedAt: string | null
  originalUrl: string | null
  filePath: string | null
  isEditorPick: boolean
  author: string | null
  sourceName: string | null
  keywords: string[]
}

export default function ContentRow({
  id,
  title,
  summaryKo,
  bodyOriginal,
  category,
  publishedAt,
  originalUrl,
  filePath,
  isEditorPick,
  author,
  sourceName,
  keywords,
}: Props) {
  const catStyle  = CATEGORY_STYLE[category] ?? 'bg-muted text-muted-foreground'
  const dateStr   = formatDate(publishedAt)
  const isYoutube = category === '유튜브'
  const tags      = keywords.slice(0, 5)
  const excerpt   = toExcerpt(summaryKo, bodyOriginal ?? null)

  const body = (
    <div className="min-w-0 flex-1 space-y-1.5">
      {/* 상단: 카테고리 배지 + 해시태그 */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className={`shrink-0 rounded-md px-2 py-0.5 text-[11px] font-semibold ${catStyle}`}>
          {CONTENT_CATEGORY_LABEL[category] ?? category}
        </span>
        {isEditorPick && (
          <span className="shrink-0 rounded-md bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
            ⭐ 에디터 픽
          </span>
        )}
        {tags.map((kw) => (
          <span key={kw} className="text-[11px] font-medium text-brand-600">
            #{kw}
          </span>
        ))}
      </div>

      {/* 제목 */}
      <p className="line-clamp-1 text-sm font-semibold leading-snug text-foreground transition-colors group-hover:text-brand-600">
        {title}
      </p>

      {/* 요약 */}
      {excerpt && (
        <p className="line-clamp-1 text-xs leading-relaxed text-muted-foreground">
          {excerpt}
        </p>
      )}

      {/* 메타 */}
      <p className="text-[11px] text-muted-foreground">
        {[sourceName ?? author, dateStr ? `발행 ${dateStr}` : '발행일 미상']
          .filter(Boolean)
          .join(' · ')}
      </p>
    </div>
  )

  return (
    <article className="group flex w-full items-center gap-4 rounded-xl border border-border bg-card px-5 py-4 shadow-sm transition-all hover:border-brand-200 hover:shadow-md">
      {isYoutube ? (
        body
      ) : (
        <Link href={`/dashboard/contents/${id}`} className="min-w-0 flex-1">
          {body}
        </Link>
      )}

      {/* 액션 */}
      <div className="shrink-0">
        {originalUrl ? (
          <a
            href={originalUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-brand-600 hover:text-brand-600"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            원문
          </a>
        ) : filePath ? (
          <span className="flex items-center gap-1.5 rounded-lg border border-border bg-muted px-3 py-1.5 text-xs font-medium text-muted-foreground">
            <FileText className="h-3.5 w-3.5" />
            리포트
          </span>
        ) : null}
      </div>
    </article>
  )
}
