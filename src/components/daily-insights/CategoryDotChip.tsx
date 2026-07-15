import { Badge } from '@/components/ui/badge'
import { CATEGORY_DOT_COLOR } from '@/lib/daily-insights/constants'
import { cn } from '@/lib/utils'

interface CategoryDotChipProps {
  category: string
}

/**
 * "핵심 인사이트" 목록 페이지(1단계) 카드 전용 라벨칩 — 무채색 배경 + 작은 컬러 도트(§2).
 * 홈/상세의 CategoryBadge(다색 배경, 지시서 20260711 승인 예외)와는 다른 톤 — 다색 칩 배경 남발 방지.
 */
export default function CategoryDotChip({ category }: CategoryDotChipProps) {
  const dotColor = CATEGORY_DOT_COLOR[category] ?? 'bg-muted-foreground'
  return (
    <Badge variant="secondary" className="gap-1.5">
      <span className={cn('h-1.5 w-1.5 rounded-full', dotColor)} aria-hidden />
      {category}
    </Badge>
  )
}
