import type { ContentCategory } from '@/lib/types'
import type { LucideIcon } from 'lucide-react'
import { Newspaper, BarChart2, Globe, Play, BrainCircuit, FileText } from 'lucide-react'

export interface CategoryDef {
  id: string
  Icon: LucideIcon
  label: string
  /** URL 라우팅 키 (= 표시 카테고리명) */
  category: ContentCategory
  /** 실제 DB에서 조회할 category 값 배열 */
  dbCategories: ContentCategory[]
  /** 유튜브처럼 별도 경로를 쓸 경우 지정 */
  href?: string
}

export const CATEGORY_DEFS: CategoryDef[] = [
  {
    id: 'news',
    Icon: Newspaper,
    label: '뉴스',
    category: '뉴스',
    dbCategories: ['뉴스'],
  },
  {
    id: 'research',
    Icon: BarChart2,
    label: '리서치',
    category: '리서치',
    dbCategories: ['리포트', '가트너', 'KRG'],
  },
  {
    id: 'web-insight',
    Icon: Globe,
    label: '웹인사이트',
    category: '웹인사이트',
    dbCategories: ['웹인사이트', '오피니언'],
  },
  {
    id: 'youtube',
    Icon: Play,
    label: '유튜브',
    category: '유튜브',
    dbCategories: ['유튜브'],
    href: '/dashboard/youtube',
  },
  {
    id: 'ai-analysis',
    Icon: BrainCircuit,
    label: 'AI분석',
    category: 'AI분석',
    dbCategories: ['AI보고서', 'AI분석'],
  },
  {
    id: 'strategy',
    Icon: FileText,
    label: '전략보고서',
    category: '전략보고서',
    dbCategories: ['전략보고서'],
  },
]

export const ALL_CATEGORIES: ContentCategory[] = CATEGORY_DEFS.map((d) => d.category)

/** 표시 카테고리명 → DB 조회 category 배열 */
export function getCategoryDbValues(displayCategory: ContentCategory): ContentCategory[] {
  const def = CATEGORY_DEFS.find((d) => d.category === displayCategory)
  return def?.dbCategories ?? [displayCategory]
}
