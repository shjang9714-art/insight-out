import type { ContentCategory } from '@/lib/types'

export interface CategoryDef {
  id: string
  icon: string
  label: string
  category: ContentCategory
}

export const CATEGORY_DEFS: CategoryDef[] = [
  { id: 'news',        icon: '📰', label: '뉴스',      category: '뉴스' },
  { id: 'report',      icon: '📊', label: '리포트',    category: '리포트' },
  { id: 'web-insight', icon: '💡', label: '웹인사이트', category: '웹인사이트' },
  { id: 'youtube',     icon: '▶️', label: '유튜브',    category: '유튜브' },
  { id: 'ai-report',   icon: '🤖', label: 'AI보고서',  category: 'AI보고서' },
]

export const ALL_CATEGORIES: ContentCategory[] = CATEGORY_DEFS.map((d) => d.category)
