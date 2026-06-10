import Link from 'next/link'
import { ExternalLink, FileText } from 'lucide-react'
import { CONTENT_CATEGORY_LABEL, type ContentCategory } from '@/lib/types'

const CATEGORY_STYLE: Partial<Record<ContentCategory, string>> = {
  '뉴스':      'bg-blue-50 text-blue-700 border-blue-100',
  '가트너':    'bg-purple-50 text-purple-700 border-purple-100',
  'KRG':      'bg-orange-50 text-orange-700 border-orange-100',
  '웹인사이트': 'bg-teal-50 text-teal-700 border-teal-100',
  '오피니언':  'bg-green-50 text-green-700 border-green-100',
  '뉴스레터':  'bg-indigo-50 text-indigo-700 border-indigo-100',
  'AI보고서':  'bg-pink-50 text-pink-700 border-pink-100',
  '유튜브':    'bg-red-50 text-red-700 border-red-100',
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
  category,
  publishedAt,
  originalUrl,
  filePath,
  isEditorPick,
  author,
  sourceName,
  keywords,
}: Props) {
  const catStyle = CATEGORY_STYLE[category] ?? 'bg-muted text-muted-foreground border-border'
  const dateStr  = formatDate(publishedAt)
  const isYoutube = category === '유튜브'
  const visibleKeywords = keywords.slice(0, 4)

  const inner = (
    <div className="min-w-0 flex-1">
      <div className="mb-1 flex flex-wrap items-center gap-1.5">
        <span
          className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium ${catStyle}`}
        >
          {CONTENT_CATEGORY_LABEL[category] ?? category}
        </span>
        {isEditorPick && (
          <span className="inline-flex items-center rounded-full border border-amber-100 bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-700">
            ⭐ 에디터 픽
          </span>
        )}
      </div>
      <p className="mb-0.5 line-clamp-1 text-sm font-semibold leading-snug text-foreground transition-colors group-hover:text-brand-600">
        {title}
      </p>
      {summaryKo && (
        <p className="mb-1 line-clamp-1 text-xs leading-relaxed text-muted-foreground">
          {summaryKo}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
        {sourceName && <span className="font-medium">{sourceName}</span>}
        {author && !sourceName && <span>{author}</span>}
        <span>{dateStr ? `발행 ${dateStr}` : '발행일 미상'}</span>
        {visibleKeywords.length > 0 && (
          <>
            <span className="text-border">·</span>
            {visibleKeywords.map((kw) => (
              <span key={kw} className="text-[11px] text-brand-600">
                #{kw}
              </span>
            ))}
          </>
        )}
      </div>
    </div>
  )

  return (
    <article className="group flex items-start justify-between gap-4 rounded-xl border border-border bg-card px-5 py-3.5 transition-shadow hover:shadow-sm">
      {isYoutube ? (
        inner
      ) : (
        <Link href={`/dashboard/contents/${id}`} className="min-w-0 flex-1">
          {inner}
        </Link>
      )}
      <div className="shrink-0 pt-0.5">
        {originalUrl ? (
          <a
            href={originalUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-brand-600 hover:text-brand-600"
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
