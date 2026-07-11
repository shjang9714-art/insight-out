import { Badge } from '@/components/ui/badge'
import { CATEGORY_CHIP_COLOR } from '@/lib/daily-insights/constants'

interface CategoryBadgeProps {
  category: string
}

/**
 * "핵심 인사이트" 라벨칩 전용 색상 배지(§지시서 20260711 §2).
 * CATEGORY_CHIP_COLOR 에 없는 category(미분류 등)는 기존 무채색 secondary 로 폴백.
 */
export default function CategoryBadge({ category }: CategoryBadgeProps) {
  return (
    <Badge variant="secondary" className={CATEGORY_CHIP_COLOR[category]}>
      {category}
    </Badge>
  )
}
