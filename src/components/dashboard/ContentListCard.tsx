'use client'

import { useState } from 'react'
import Link from 'next/link'
import { CalendarDays, ExternalLink, FileText, ChevronDown, ChevronUp } from 'lucide-react'
import CoverImage from '@/components/common/CoverImage'
import { CONTENT_CATEGORY_LABEL, type ContentCategory } from '@/lib/types'
import BrandedCover from '@/components/dashboard/BrandedCover'
import LguImpactBadge from '@/components/contents/LguImpactBadge'

function formatDate(d: string | null) {
  if (!d) return null
  return new Date(d).toLocaleDateString('ko-KR', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

interface ClusterMember {
  name: string
  url: string | null
  title: string
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
  clusterMembers?: ClusterMember[]
  thumbnailUrl?: string | null
  /** LG U+ 관점 위기/기회(313) — '관망'·null 은 배지 없음 */
  lguImpact?: string | null
  /** 일별 헤더가 없는 평면 목록에서 카드 자체에 발행일을 강조한다. */
  showPublishedDateBadge?: boolean
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
  clusterMembers,
  thumbnailUrl,
  lguImpact,
  showPublishedDateBadge = false,
}: ContentListCardProps) {
  const [expanded, setExpanded] = useState(false)
  const dateStr     = formatDate(publishedAt)
  const memberCount = clusterMembers?.length ?? 0

  const inner = (
    <div className="flex h-full flex-col">
      {/* 표지 — 썸네일 없으면 BrandedCover 폴백(229) */}
      <div className="aspect-[16/9] overflow-hidden rounded-t-2xl bg-muted">
        <CoverImage
          src={thumbnailUrl}
          alt={title}
          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
          loading="lazy"
          fallback={<BrandedCover category={category} title={title} sourceName={sourceName ?? null} />}
        />
      </div>
      <div className="flex flex-1 flex-col p-5">
        {/* 상단: 카테고리 배지 + 해시태그 + 에디터픽 */}
        <div className="mb-3 flex flex-wrap items-center gap-1">
          <span className="rounded-md bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
            {CONTENT_CATEGORY_LABEL[category] ?? category}
          </span>
          <LguImpactBadge impact={lguImpact} />
          {showPublishedDateBadge && (
            <span className="inline-flex items-center gap-1 rounded-full border border-border bg-background px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
              <CalendarDays className="h-3 w-3" aria-hidden />
              {dateStr ?? '발행일 미상'}
            </span>
          )}
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
          <p className="flex min-w-0 flex-1 items-center gap-1 text-[11px] text-muted-foreground">
            {(sourceName ?? author) && (
              <>
                <span className="truncate">{sourceName ?? author}</span>
                <span className="shrink-0" aria-hidden>·</span>
              </>
            )}
            <span className="shrink-0 whitespace-nowrap">
              {dateStr ? `발행 ${dateStr}` : '발행일 미상'}
            </span>
          </p>
          {originalUrl && (
            <a
              href={`/api/contents/${id}/source`}
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

        {/* 클러스터 접힘 — 같은 사건 다매체 */}
        {memberCount > 0 && (
          <div className="mt-2 border-t border-border/60 pt-2">
            <button
              type="button"
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); setExpanded((v) => !v) }}
              className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
            >
              <span className="rounded-full bg-secondary px-2 py-0.5 font-medium">
                +{memberCount}개 매체
              </span>
              {expanded
                ? <ChevronUp className="h-3 w-3" />
                : <ChevronDown className="h-3 w-3" />}
            </button>
            {expanded && (
              <ul className="mt-1.5 space-y-1 pl-1">
                {clusterMembers!.map((m, i) => (
                  <li key={i} className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    <span className="shrink-0 font-medium">{m.name}</span>
                    {m.url && (
                      <>
                        <span className="text-muted-foreground/40">—</span>
                        <a
                          href={m.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="text-brand-600 underline-offset-2 hover:underline"
                        >
                          원문 보기
                        </a>
                      </>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  )

  const cardClass =
    'group flex flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-sm transition-all hover:border-brand-200 hover:shadow-md'

  // 252 — 유튜브도 인앱 상세로. "원문" 버튼은 위 풋터에서 별도 제공.
  return (
    <Link
      href={`/dashboard/contents/${id}?category=${encodeURIComponent(category)}`}
      prefetch={false}
      target="_blank"
      rel="noopener"
      className={cardClass}
    >
      <article className="h-full">{inner}</article>
    </Link>
  )
}
