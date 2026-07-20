import type { ContentCategory } from '@/lib/types'

/**
 * 376 — 어드민 전용 콘텐츠 관리 탭 (시스템 메뉴 순서: 콘텐츠 뉴스/유튜브/웹인사이트 → 리포트 외부리포트/지식보고서).
 * `CATEGORY_DEFS`(src/lib/categories.ts)는 사용자 화면(CategoryGrid·SearchBar)과 공유하므로 직접 수정하지 않고
 * 여기서만 순서·라벨·dbCategories 매핑을 별도로 다룬다.
 */
export interface AdminCategoryTab {
  id: string
  label: string
  dbCategories: ContentCategory[]
}

export const ADMIN_CATEGORY_TABS: AdminCategoryTab[] = [
  { id: '뉴스',      label: '뉴스',      dbCategories: ['뉴스'] },
  { id: '유튜브',    label: '유튜브',    dbCategories: ['유튜브'] },
  { id: '웹인사이트', label: '웹인사이트', dbCategories: ['웹인사이트', '오피니언'] },
  { id: '외부리포트', label: '외부리포트', dbCategories: ['리포트', '가트너', 'KRG'] },
  { id: '지식보고서', label: '지식보고서', dbCategories: ['지식보고서'] },
]

/** 탭 id → 조회할 dbCategories. 어드민 탭이 아니면 null (호출부에서 toDbCategories 로 폴백) */
export function adminTabDbCategories(tabId: string): ContentCategory[] | null {
  return ADMIN_CATEGORY_TABS.find((t) => t.id === tabId)?.dbCategories ?? null
}

/** URL 파라미터(구 라벨 포함) → 어드민 탭 id. 매칭되는 탭이 없으면 원값 그대로(비-탭 카테고리 필터로 폴백) */
export function adminTabIdFor(rawCategory: string): string {
  if (rawCategory === '리서치') return '외부리포트' // 구 "리서치" 탭 라벨 호환
  const tab = ADMIN_CATEGORY_TABS.find(
    (t) => t.id === rawCategory || (t.dbCategories as readonly string[]).includes(rawCategory)
  )
  return tab ? tab.id : rawCategory
}
