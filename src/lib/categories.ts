import type { ContentCategory } from '@/lib/types'

export interface CategoryDef {
  id: string
  icon: string
  label: string
  category: ContentCategory
}

export const CATEGORY_DEFS: CategoryDef[] = [
  { id: 'news',        icon: '📰', label: '뉴스',      category: '뉴스' },
  { id: 'gartner',     icon: '📊', label: '가트너',    category: '가트너' },
  { id: 'krg',         icon: '📋', label: 'KRG',       category: 'KRG' },
  { id: 'web-insight', icon: '💡', label: '웹인사이트', category: '웹인사이트' },
  { id: 'opinion',     icon: '💼', label: '오피니언',  category: '오피니언' },
  { id: 'newsletter',  icon: '📧', label: '뉴스레터',  category: '뉴스레터' },
  { id: 'ai-report',   icon: '🤖', label: 'AI보고서',  category: 'AI보고서' },
  { id: 'youtube',     icon: '▶️', label: '유튜브',    category: '유튜브' },
]

export const ALL_CATEGORIES: ContentCategory[] = CATEGORY_DEFS.map((d) => d.category)
