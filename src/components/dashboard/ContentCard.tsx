import Link from 'next/link'
import CoverImage from '@/components/common/CoverImage'
import { CONTENT_CATEGORY_LABEL, type ContentCategory } from '@/lib/types'
import BrandedCover, { CATEGORY_COLOR } from '@/components/dashboard/BrandedCover'
import { extractVideoId } from '@/lib/youtube'
import LguImpactBadge from '@/components/contents/LguImpactBadge'
import { CARD_BADGE_ROW_CLASS, CARD_MAX_VISIBLE_TAGS, CARD_PADDING_CLASS, CARD_TAG_ROW_CLASS } from '@/lib/contents/card-contract'
import { tagFilterHref } from '@/lib/contents/excerpt'

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

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('ko-KR', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: 'numeric',
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
  /** 외부(새 탭) 이동 링크 — 있으면 href/id 라우트보다 우선(유튜브 등) */
  externalHref?: string | null
  keywords?: string[]
  /** LG U+ 관점 위기/기회(313) — '관망'·null 은 배지 없음 */
  lguImpact?: string | null
}

// ─── 썸네일 영역 ─────────────────────────────────────────────────────────────

function Thumbnail({
  url,
  category,
  title,
  sourceName,
  externalHref,
}: {
  url: string | null
  category: ContentCategory
  title: string
  sourceName: string | null
  externalHref?: string | null
}) {
  const isYoutube = category === '유튜브'
  // 크롤 썸네일 없으면 유튜브 video_id 유래 썸네일로 폴백(그것도 없으면 BrandedCover)
  const fallbackYoutubeThumb = isYoutube && !url
    ? (() => {
        const videoId = extractVideoId(externalHref ?? null)
        return videoId ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` : null
      })()
    : null
  const resolvedUrl = url ?? fallbackYoutubeThumb

  if (!resolvedUrl) {
    return <BrandedCover category={category} title={title} sourceName={sourceName} />
  }

  return (
    <div className="relative h-full w-full">
      <CoverImage
        src={resolvedUrl}
        alt={title}
        className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
        loading="lazy"
        fallback={<BrandedCover category={category} title={title} sourceName={sourceName} />}
      >
        {isYoutube && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/10 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-black/50 backdrop-blur-sm">
              <svg className="h-6 w-6 translate-x-0.5 text-white" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z" />
              </svg>
            </div>
          </div>
        )}
      </CoverImage>
    </div>
  )
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
  externalHref,
  keywords,
  lguImpact,
}: ContentCardProps) {
  const catColor = CATEGORY_COLOR[category] ?? 'bg-muted text-muted-foreground'
  // 252 — 유튜브는 externalHref(원본 URL)를 썸네일 추출용으로만 쓰고, 클릭은 인앱 상세로(이탈 방지).
  const isExternal = Boolean(externalHref) && category !== '유튜브'
  const resolvedHref = isExternal
    ? externalHref!
    : (href ?? `/dashboard/contents/${id}?category=${encodeURIComponent(category)}`)

  // 211 — 모든 카드가 표지를 갖는다(썸네일 없으면 BrandedCover 표시 시점 렌더, 저장 없음)
  const inner = (
    <>
      <div className="aspect-[16/9] overflow-hidden rounded-t-2xl bg-muted">
        <Thumbnail url={thumbnailUrl} category={category} title={title} sourceName={sourceName} externalHref={externalHref} />
      </div>

      <div className={`flex flex-1 flex-col ${CARD_PADDING_CLASS}`}>
        <div className={CARD_BADGE_ROW_CLASS}>
          <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${catColor}`}>
            {CONTENT_CATEGORY_LABEL[category] ?? category}
          </span>
          <LguImpactBadge impact={lguImpact} className="shrink-0" />
          {sourceName && (
            <span className="min-w-0 truncate rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
              {sourceName}
            </span>
          )}
        </div>

        {/* 해시태그 — 값이 없어도 항상 렌더해 높이를 예약한다(510 카드 내부 계약).
            카드 폭 기준 한 줄 초과분은 "+N"으로 표시(줄바꿈으로 카드 높이 들쭉날쭉해지는 것 방지) */}
        <div className={CARD_TAG_ROW_CLASS}>
          {(keywords ?? []).slice(0, CARD_MAX_VISIBLE_TAGS).map((kw) => (
            <Link
              key={kw}
              href={tagFilterHref(category, kw)}
              prefetch={false}
              onClick={(e) => e.stopPropagation()}
              className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-brand-50 hover:text-brand-700 dark:hover:bg-brand-950/30 dark:hover:text-brand-300"
            >
              #{kw}
            </Link>
          ))}
          {(keywords?.length ?? 0) > CARD_MAX_VISIBLE_TAGS && (
            <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">
              +{keywords!.length - CARD_MAX_VISIBLE_TAGS}
            </span>
          )}
        </div>

        {/* 제목 — 값 유무와 무관하게 2줄 높이를 고정해 카드마다 세로 위치가 흔들리지 않게 한다 */}
        <p className="mb-1.5 line-clamp-2 min-h-[2.5rem] text-sm font-medium leading-snug text-foreground group-hover:text-brand-600">
          {title}
        </p>

        {/* 요약 — 값이 없어도 항상 렌더(빈 자리 유지), 2줄 높이 고정 */}
        <p className="mb-2 line-clamp-2 min-h-[2.5rem] text-xs leading-relaxed text-muted-foreground">
          {summaryKo ?? ''}
        </p>

        <p className="mt-auto text-[11px] text-muted-foreground">
          {publishedAt
            ? category === '유튜브'
              ? `발행 ${formatDate(publishedAt)} · ${timeAgo(publishedAt)}`
              : `발행 ${timeAgo(publishedAt)}`
            : '발행일 미상'}
        </p>
      </div>
    </>
  )

  const cardClass =
    'group flex h-full flex-col rounded-2xl border border-border bg-card overflow-hidden transition-all hover:shadow-md hover:border-brand-200'

  if (isExternal) {
    return (
      <a href={resolvedHref} target="_blank" rel="noopener noreferrer" className={cardClass}>
        {inner}
      </a>
    )
  }

  return (
    <Link
      href={resolvedHref}
      prefetch={false}
      target="_blank"
      rel="noopener"
      className={cardClass}
    >
      {inner}
    </Link>
  )
}
