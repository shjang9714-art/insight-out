import Link from 'next/link'
import { CONTENT_CATEGORY_LABEL, type ContentCategory } from '@/lib/types'
import LguImpactBadge from '@/components/contents/LguImpactBadge'

const CATEGORY_STYLE: Partial<Record<ContentCategory, string>> = {
  '뉴스':      'bg-blue-50 text-blue-700 border-blue-100',
  '리포트':    'bg-purple-50 text-purple-700 border-purple-100',
  '웹인사이트': 'bg-teal-50 text-teal-700 border-teal-100',
  'AI보고서':  'bg-pink-50 text-pink-700 border-pink-100',
  '유튜브':    'bg-red-50 text-red-700 border-red-100',
  // deprecated
  '가트너':    'bg-purple-50 text-purple-700 border-purple-100',
  'KRG':      'bg-orange-50 text-orange-700 border-orange-100',
  '오피니언':  'bg-green-50 text-green-700 border-green-100',
  '뉴스레터':  'bg-indigo-50 text-indigo-700 border-indigo-100',
}

interface Props {
  title: string
  category: ContentCategory
  sourceName: string | null
  author: string | null
  dateLabel: string | null
  originalLanguage?: string | null
  serviceNames?: string[]
  keywordNames?: string[]
  /** 카테고리 뱃지 옆에 노출하는 해시태그(엔티티 등) — 클릭 시 topics 모아보기로 이동 */
  hashtags?: { label: string; href: string }[]
  /** LG U+ 관점 위기/기회(313) — '관망'·null 은 배지 없음 */
  lguImpact?: string | null
  actions?: React.ReactNode
  children: React.ReactNode
}

/**
 * 기사 본문 블록(제목·소스/발행일/저자·태그·본문)의 공용 렌더.
 * 본문(children)은 호출부가 결정 — 서비스는 ArticleBodyLoader/리포트 미리보기,
 * 어드민은 이미 조회된 본문 텍스트를 그대로 전달.
 */
export default function ContentArticleView({
  title,
  category,
  sourceName,
  author,
  dateLabel,
  originalLanguage,
  serviceNames = [],
  keywordNames = [],
  hashtags = [],
  lguImpact,
  actions,
  children,
}: Props) {
  const catStyle = CATEGORY_STYLE[category] ?? 'bg-muted text-muted-foreground border-border'

  return (
    <>
      {/* 카테고리 뱃지 */}
      <div className="mb-3 flex flex-wrap gap-1.5">
        <span
          className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${catStyle}`}
        >
          {CONTENT_CATEGORY_LABEL[category] ?? category}
        </span>
        <LguImpactBadge impact={lguImpact} />
        {originalLanguage === 'en' && (
          <span className="inline-flex items-center rounded-full border border-border bg-muted px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground">
            영어 원문
          </span>
        )}
        {hashtags.map((h) => (
          <Link
            key={h.href}
            href={h.href}
            prefetch={false}
            className="inline-flex items-center rounded-full bg-muted px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-brand-50 hover:text-brand-700 dark:hover:bg-brand-950/30 dark:hover:text-brand-300"
          >
            #{h.label}
          </Link>
        ))}
      </div>

      <h1 className="mb-3 text-xl font-bold leading-snug text-foreground">{title}</h1>

      {/* 메타 + 상단 액션 */}
      <div className="mb-5 flex flex-wrap items-start justify-between gap-y-2">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          {sourceName && <span className="font-medium text-foreground">{sourceName}</span>}
          {author && <span>{author}</span>}
          {dateLabel && <span>{dateLabel}</span>}
        </div>
        {actions && <div className="flex shrink-0 items-center gap-1.5">{actions}</div>}
      </div>

      {(serviceNames.length > 0 || keywordNames.length > 0) && (
        <div className="mb-5 flex flex-wrap gap-1.5">
          {serviceNames.map((name) => (
            <span
              key={name}
              className="rounded-full bg-brand-50 px-2.5 py-0.5 text-[11px] font-medium text-brand-700 dark:bg-brand-950/30 dark:text-brand-300"
            >
              {name}
            </span>
          ))}
          {keywordNames.map((name) => (
            <span
              key={name}
              className="rounded-full bg-muted px-2.5 py-0.5 text-[11px] text-muted-foreground"
            >
              #{name}
            </span>
          ))}
        </div>
      )}

      <div className="mb-6 border-t border-border" />

      {children}
    </>
  )
}
