import Link from 'next/link'
import { ExternalLink, FileSearch, Globe2, Newspaper, Video, type LucideIcon } from 'lucide-react'
import CoverImage from '@/components/common/CoverImage'
import LguImpactBadge from '@/components/contents/LguImpactBadge'
import { CONTENT_CATEGORY_LABEL, type ContentCategory } from '@/lib/types'
import { CARD_MAX_VISIBLE_TAGS } from '@/lib/contents/card-contract'
import { tagFilterHref } from '@/lib/contents/excerpt'

const CATEGORY_ICON: Partial<Record<ContentCategory, LucideIcon>> = {
  '뉴스': Newspaper,
  '유튜브': Video,
  '웹인사이트': Globe2,
  '리서치': FileSearch,
}

function formatDate(date: string | null): string {
  if (!date) return '발행일 미상'
  return new Date(date).toLocaleDateString('ko-KR', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  })
}

interface ContentListRowProps {
  id: string
  title: string
  excerpt: string | null
  category: ContentCategory
  publishedAt: string | null
  originalUrl: string | null
  /** 외부(새 탭) 이동 링크 — 있으면 상세 페이지 대신 이 링크로 바로 연결한다(유튜브 등). */
  externalHref?: string | null
  sourceName: string | null
  tags: string[]
  thumbnailUrl: string | null
  lguImpact?: string | null
}

export default function ContentListRow({
  id,
  title,
  excerpt,
  category,
  publishedAt,
  originalUrl,
  externalHref,
  sourceName,
  tags,
  thumbnailUrl,
  lguImpact,
}: ContentListRowProps) {
  const Icon = CATEGORY_ICON[category] ?? Newspaper
  const detailHref = `/dashboard/contents/${id}`
  const isExternal = Boolean(externalHref)
  const primaryLinkProps = isExternal
    ? { href: externalHref!, target: '_blank', rel: 'noopener noreferrer' }
    : { href: detailHref, prefetch: false, target: '_blank', rel: 'noopener' }

  return (
    <article className="group flex gap-4 rounded-xl border border-border bg-card p-3 transition-all hover:border-brand-200 hover:shadow-sm sm:p-4">
      {/* prefetch-ok: href가 내부 상세/외부 원문으로 동적 — 내부 분기는 primaryLinkProps에서 prefetch:false, 외부 분기는 새 탭 외부링크라 prefetch 무관 */}
      <Link
        {...primaryLinkProps}
        className="flex h-24 w-28 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-muted sm:h-28 sm:w-40"
      >
        <CoverImage
          src={thumbnailUrl}
          alt={title}
          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
          loading="lazy"
          fallback={<Icon className="h-9 w-9 text-muted-foreground/35" strokeWidth={1.4} aria-hidden />}
        />
      </Link>

      <div className="min-w-0 flex-1">
        <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
          <span className="rounded-md bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
            {CONTENT_CATEGORY_LABEL[category] ?? category}
          </span>
          <LguImpactBadge impact={lguImpact} />
          {tags.slice(0, CARD_MAX_VISIBLE_TAGS).map((tag) => (
            <Link
              key={tag}
              href={tagFilterHref(category, tag)}
              prefetch={false}
              className="rounded-full bg-brand-50 px-2 py-0.5 text-[11px] font-medium text-brand-700 transition-colors hover:bg-brand-100 dark:bg-brand-950/30 dark:text-brand-300 dark:hover:bg-brand-950/50"
            >
              #{tag}
            </Link>
          ))}
          {tags.length > CARD_MAX_VISIBLE_TAGS && (
            <span className="rounded-full bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">
              +{tags.length - CARD_MAX_VISIBLE_TAGS}
            </span>
          )}
        </div>

        {/* prefetch-ok: href가 내부 상세/외부 원문으로 동적 — 내부 분기는 primaryLinkProps에서 prefetch:false, 외부 분기는 새 탭 외부링크라 prefetch 무관 */}
        <Link {...primaryLinkProps}>
          <h2 className="line-clamp-2 text-[15px] font-bold leading-snug text-foreground transition-colors group-hover:text-brand-600">
            {title}
          </h2>
        </Link>

        <p className="mt-1.5 line-clamp-2 text-[13px] leading-relaxed text-muted-foreground">
          {excerpt ?? '요약 정보가 없습니다.'}
        </p>

        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted-foreground">
          <span className="flex min-w-0 flex-1 items-center gap-1">
            {sourceName && (
              <>
                <span className="truncate">{sourceName}</span>
                <span className="shrink-0" aria-hidden>·</span>
              </>
            )}
            <span className="shrink-0 whitespace-nowrap">{formatDate(publishedAt)}</span>
          </span>
          {originalUrl && !isExternal && (
            <a
              href={`/api/contents/${id}/source`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex shrink-0 items-center gap-1 font-medium transition-colors hover:text-brand-600"
            >
              <ExternalLink className="h-3 w-3" aria-hidden />
              원문
            </a>
          )}
        </div>
      </div>
    </article>
  )
}
