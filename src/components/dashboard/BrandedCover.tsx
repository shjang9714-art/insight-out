import { CONTENT_CATEGORY_LABEL, type ContentCategory } from '@/lib/types'

// ─── 카테고리 색 맵 ──────────────────────────────────────────────────────────

export const CATEGORY_COLOR: Partial<Record<ContentCategory, string>> = {
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
export const CATEGORY_FALLBACK_BG: Partial<Record<ContentCategory, string>> = {
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

/**
 * 211 — 썸네일 없는 콘텐츠의 기본 표지. 표시 시점에만 렌더(저장 없음),
 * 제목·카테고리·발행처로 브랜드 느낌의 커버를 구성한다.
 */
export default function BrandedCover({
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
