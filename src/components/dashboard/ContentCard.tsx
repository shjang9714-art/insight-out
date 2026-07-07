import Link from 'next/link'
import { CONTENT_CATEGORY_LABEL, type ContentCategory } from '@/lib/types'

// ─── 카테고리 색 맵 ──────────────────────────────────────────────────────────

const CATEGORY_COLOR: Partial<Record<ContentCategory, string>> = {
  '뉴스':      'bg-brand-50 text-brand-600',
  '리포트':    'bg-purple-50 text-purple-700',
  '웹인사이트': 'bg-teal-50 text-teal-700',
  'AI보고서':  'bg-pink-50 text-pink-700',
  '유튜브':    'bg-red-50 text-red-700',
  // deprecated
  '가트너':    'bg-purple-50 text-purple-700',
  'KRG':      'bg-orange-50 text-orange-700',
  '오피니언':  'bg-green-50 text-green-700',
  '뉴스레터':  'bg-indigo-50 text-indigo-700',
}

// 썸네일 없을 때 카테고리별 그라데이션 폴백 배경
const CATEGORY_FALLBACK_BG: Partial<Record<ContentCategory, string>> = {
  '뉴스':      'from-brand-50 to-pink-50 dark:from-rose-950/40 dark:to-pink-950/30',
  '리포트':    'from-purple-50 to-indigo-50 dark:from-purple-950/40 dark:to-indigo-950/30',
  '웹인사이트': 'from-teal-50 to-cyan-50 dark:from-teal-950/40 dark:to-cyan-950/30',
  'AI보고서':  'from-pink-50 to-rose-50 dark:from-pink-950/40 dark:to-rose-950/30',
  '유튜브':    'from-red-50 to-orange-50 dark:from-red-950/40 dark:to-orange-950/30',
  // deprecated
  '가트너':    'from-purple-50 to-indigo-50 dark:from-purple-950/40 dark:to-indigo-950/30',
  'KRG':      'from-orange-50 to-amber-50 dark:from-orange-950/40 dark:to-amber-950/30',
  '오피니언':  'from-green-50 to-emerald-50 dark:from-green-950/40 dark:to-emerald-950/30',
  '뉴스레터':  'from-indigo-50 to-blue-50 dark:from-indigo-950/40 dark:to-blue-950/30',
}

// ─── timeAgo ────────────────────────────────────────────────────────────────

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return '발행일 미상'
  const diff = Date.now() - new Date(dateStr).getTime()
  const h = Math.floor(diff / 3_600_000)
  if (h < 1)  return '방금 전'
  if (h < 24) return `${h}시간 전`
  const d = Math.floor(h / 24)
  if (d < 7)  return `${d}일 전`
  return new Date(dateStr).toLocaleDateString('ko-KR', {
    timeZone: 'Asia/Seoul',
    month: 'short',
    day: 'numeric',
  })
}

// ─── Props ───────────────────────────────────────────────────────────────────

interface ContentCardProps {
  id: string
  title: string
  summaryKo: string | null
  category: ContentCategory
  sourceName: string | null
  publishedAt: string | null
  thumbnailUrl: string | null
  href?: string | null
  keywords?: string[]
}

// ─── 썸네일 영역 ─────────────────────────────────────────────────────────────

/**
 * 211 — 썸네일 없는 콘텐츠의 기본 표지. 표시 시점에만 렌더(저장 없음),
 * 제목·카테고리·발행처로 브랜드 느낌의 커버를 구성한다.
 */
function BrandedCover({
  category,
  title,
  sourceName,
}: {
  category: ContentCategory
  title: string
  sourceName: string | null
}) {
  const fallbackBg = CATEGORY_FALLBACK_BG[category] ?? 'from-muted to-muted'
  const label = CONTENT_CATEGORY_LABEL[category] ?? category

  return (
    <div
      role="img"
      aria-label={title}
      className={`flex h-full w-full flex-col justify-between bg-gradient-to-br ${fallbackBg} p-4`}
    >
      <span className="inline-flex w-fit rounded-full bg-background/70 px-2 py-0.5 text-[11px] font-semibold text-foreground backdrop-blur-sm dark:bg-background/40">
        {label}
      </span>
      <div>
        <p className="line-clamp-3 text-sm font-bold leading-snug text-foreground">
          {title}
        </p>
        {sourceName && (
          <p className="mt-1 truncate text-[11px] font-medium text-foreground/70">
            {sourceName}
          </p>
        )}
      </div>
    </div>
  )
}

function Thumbnail({
  url,
  category,
  title,
  sourceName,
}: {
  url: string | null
  category: ContentCategory
  title: string
  sourceName: string | null
}) {
  if (url) {
    return (
      // next/image remotePatterns 미설정 → unoptimized로 빌드 에러 방지
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={url}
        alt={title}
        className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
        loading="lazy"
      />
    )
  }

  return <BrandedCover category={category} title={title} sourceName={sourceName} />
}

// ─── ContentCard ─────────────────────────────────────────────────────────────

export default function ContentCard({
  id,
  title,
  summaryKo,
  category,
  sourceName,
  publishedAt,
  thumbnailUrl,
  href,
  keywords,
}: ContentCardProps) {
  const catColor = CATEGORY_COLOR[category] ?? 'bg-muted text-muted-foreground'
  const resolvedHref = href ?? (category !== '유튜브' ? `/dashboard/contents/${id}` : null)

  // 211 — 모든 카드가 표지를 갖는다(썸네일 없으면 BrandedCover 표시 시점 렌더, 저장 없음)
  const inner = (
    <>
      <div className="aspect-[16/9] overflow-hidden rounded-t-2xl bg-muted">
        <Thumbnail url={thumbnailUrl} category={category} title={title} sourceName={sourceName} />
      </div>

      <div className="flex flex-1 flex-col p-4">
        <div className="mb-2 flex flex-wrap items-center gap-1.5">
          <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${catColor}`}>
            {CONTENT_CATEGORY_LABEL[category] ?? category}
          </span>
          {sourceName && (
            <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
              {sourceName}
            </span>
          )}
        </div>

        {/* 해시태그 */}
        {keywords && keywords.length > 0 && (
          <div className="mb-1.5 flex flex-wrap gap-1">
            {keywords.map((kw) => (
              <span key={kw} className="rounded-full bg-brand-50 px-2 py-0.5 text-[11px] font-medium text-brand-700 dark:bg-brand-950/30 dark:text-brand-300">
                #{kw}
              </span>
            ))}
          </div>
        )}

        {/* 제목 */}
        <p className="mb-1.5 line-clamp-2 text-sm font-medium leading-snug text-foreground group-hover:text-brand-600">
          {title}
        </p>

        {summaryKo && (
          <p className="mb-2 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
            {summaryKo}
          </p>
        )}

        <p className="mt-auto text-[11px] text-muted-foreground">
          {publishedAt ? `발행 ${timeAgo(publishedAt)}` : '발행일 미상'}
        </p>
      </div>
    </>
  )

  const cardClass =
    'group flex h-full flex-col rounded-2xl border border-border bg-card overflow-hidden transition-all hover:shadow-md hover:border-brand-200'

  if (resolvedHref) {
    return <Link href={resolvedHref} className={cardClass}>{inner}</Link>
  }

  return <div className={cardClass}>{inner}</div>
}
