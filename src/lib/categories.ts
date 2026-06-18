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
  /** 아이콘 컬러 클래스 (비활성) */
  iconClass: string
  /** 활성 상태 border + text 컬러 클래스 */
  activeClass: string
  /** hover 상태 border 컬러 클래스 */
  hoverClass: string
  /** AI분석·전략보고서 등 contents 테이블에 없는 생성물 카테고리 */
  generated?: boolean
}

export const CATEGORY_DEFS: CategoryDef[] = [
  {
    id: 'news',
    Icon: Newspaper,
    label: '뉴스',
    category: '뉴스',
    dbCategories: ['뉴스'],
    iconClass: 'text-blue-600 dark:text-blue-400',
    activeClass: 'border-blue-600 text-blue-600 dark:border-blue-400 dark:text-blue-400',
    hoverClass: 'hover:border-blue-200 hover:text-blue-700 dark:hover:border-blue-800 dark:hover:text-blue-300',
  },
  {
    id: 'research',
    Icon: BarChart2,
    label: '리서치',
    category: '리서치',
    dbCategories: ['리포트', '가트너', 'KRG'],
    iconClass: 'text-indigo-600 dark:text-indigo-400',
    activeClass: 'border-indigo-600 text-indigo-600 dark:border-indigo-400 dark:text-indigo-400',
    hoverClass: 'hover:border-indigo-200 hover:text-indigo-700 dark:hover:border-indigo-800 dark:hover:text-indigo-300',
  },
  {
    id: 'web-insight',
    Icon: Globe,
    label: '웹인사이트',
    category: '웹인사이트',
    dbCategories: ['웹인사이트', '오피니언'],
    iconClass: 'text-emerald-600 dark:text-emerald-400',
    activeClass: 'border-emerald-600 text-emerald-600 dark:border-emerald-400 dark:text-emerald-400',
    hoverClass: 'hover:border-emerald-200 hover:text-emerald-700 dark:hover:border-emerald-800 dark:hover:text-emerald-300',
  },
  {
    id: 'youtube',
    Icon: Play,
    label: '유튜브',
    category: '유튜브',
    dbCategories: ['유튜브'],
    href: '/dashboard/youtube',
    iconClass: 'text-red-600 dark:text-red-400',
    activeClass: 'border-red-600 text-red-600 dark:border-red-400 dark:text-red-400',
    hoverClass: 'hover:border-red-200 hover:text-red-700 dark:hover:border-red-800 dark:hover:text-red-300',
  },
  {
    id: 'ai-analysis',
    Icon: BrainCircuit,
    label: 'AI분석',
    category: 'AI분석',
    dbCategories: ['AI보고서', 'AI분석'],
    href: '/dashboard/ai-analysis',
    generated: true,
    iconClass: 'text-violet-600 dark:text-violet-400',
    activeClass: 'border-violet-600 text-violet-600 dark:border-violet-400 dark:text-violet-400',
    hoverClass: 'hover:border-violet-200 hover:text-violet-700 dark:hover:border-violet-800 dark:hover:text-violet-300',
  },
  {
    id: 'strategy',
    Icon: FileText,
    label: '전략보고서',
    category: '전략보고서',
    dbCategories: ['전략보고서'],
    generated: true,
    iconClass: 'text-amber-600 dark:text-amber-400',
    activeClass: 'border-amber-600 text-amber-600 dark:border-amber-400 dark:text-amber-400',
    hoverClass: 'hover:border-amber-200 hover:text-amber-700 dark:hover:border-amber-800 dark:hover:text-amber-300',
  },
]

export const ALL_CATEGORIES: ContentCategory[] = CATEGORY_DEFS.map((d) => d.category)

/** contents 테이블에 실제 존재하는 수집 카테고리만 (생성물 제외) */
export const COLLECTED_CATEGORY_DEFS = CATEGORY_DEFS.filter((d) => !d.generated)

/**
 * DB 값(리포트·AI보고서 등) 또는 표시값을 받아 탭에 쓰는 표시 카테고리로 정규화.
 * 예: '리포트' → '리서치', '뉴스' → '뉴스', 'AI보고서' → 'AI보고서'(탭 없음·칩 표시용)
 */
export function tabCategoryFor(value: string): string {
  const def = COLLECTED_CATEGORY_DEFS.find(
    (d) => d.category === value || (d.dbCategories as readonly string[]).includes(value)
  )
  return def ? def.category : value
}

/** 표시 카테고리명 → DB 조회 category 배열 */
export function getCategoryDbValues(displayCategory: ContentCategory): ContentCategory[] {
  const def = CATEGORY_DEFS.find((d) => d.category === displayCategory)
  return def?.dbCategories ?? [displayCategory]
}

/** content_category enum 실제 유효 값 */
export const DB_CONTENT_CATEGORIES = [
  '뉴스', '리포트', '웹인사이트', '가트너', 'KRG', '오피니언', '뉴스레터', 'AI보고서', '유튜브',
] as const

/** 표시 카테고리명 → 실제 DB enum에 있는 값만 반환 (무효값 자동 제거) */
export function toDbCategories(displayCategory: ContentCategory): ContentCategory[] {
  return getCategoryDbValues(displayCategory).filter(
    (c) => (DB_CONTENT_CATEGORIES as readonly string[]).includes(c)
  )
}
