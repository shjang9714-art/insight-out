import { adminTabDbCategories } from '@/lib/admin/content-tabs'
import { toDbCategories } from '@/lib/categories'
import { REVIEW_REASONS, type ReviewReason } from '@/lib/crawler/quality'
import type { ContentCategory } from '@/lib/types'

export const BULK_REVIEW_LIMIT = 10_000

export type ReviewBodyFilter = 'full' | 'snippet' | 'none'

export interface BulkReviewFilters {
  category: string | null
  sourceId: string | null
  reviewReason: ReviewReason | null
  bodyFilter: ReviewBodyFilter | null
  todayOnly: boolean
  searchTerm: string | null
}

export interface BulkReviewRequest extends BulkReviewFilters {
  action: 'reject'
  expectedCount: number
}

type ParseResult =
  | { ok: true; value: BulkReviewRequest }
  | { ok: false; error: string }

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const BODY_FILTERS: readonly ReviewBodyFilter[] = ['full', 'snippet', 'none']

function optionalString(value: unknown): string | null | undefined {
  if (value == null || value === '' || value === 'all') return null
  if (typeof value !== 'string') return undefined
  return value.trim() || null
}

export function resolveBulkReviewCategories(category: string | null): ContentCategory[] | null {
  if (!category) return null
  const categories =
    adminTabDbCategories(category)
    ?? toDbCategories(category as ContentCategory)
  return categories.length > 0 ? categories : null
}

export function hasBulkReviewFilter(filters: BulkReviewFilters): boolean {
  return Boolean(
    filters.category
    || filters.sourceId
    || filters.reviewReason
    || filters.bodyFilter
    || filters.todayOnly
    || filters.searchTerm
  )
}

export function parseBulkReviewRequest(raw: unknown): ParseResult {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, error: '요청 본문 형식이 올바르지 않습니다.' }
  }

  const body = raw as Record<string, unknown>
  if (body.action !== 'reject') {
    return { ok: false, error: '조건 일괄 작업은 반려만 허용됩니다.' }
  }

  if (!Number.isInteger(body.expectedCount) || typeof body.expectedCount !== 'number' || body.expectedCount < 1) {
    return { ok: false, error: 'expectedCount는 1 이상의 정수여야 합니다.' }
  }
  if (body.expectedCount > BULK_REVIEW_LIMIT) {
    return { ok: false, error: `한 번에 ${BULK_REVIEW_LIMIT.toLocaleString('ko-KR')}건을 초과해 처리할 수 없습니다.` }
  }

  const category = optionalString(body.category)
  if (category === undefined || (category && !resolveBulkReviewCategories(category))) {
    return { ok: false, error: '카테고리 필터가 올바르지 않습니다.' }
  }

  const sourceId = optionalString(body.sourceId)
  if (sourceId === undefined || (sourceId && sourceId !== 'null' && !UUID_PATTERN.test(sourceId))) {
    return { ok: false, error: '소스 필터가 올바르지 않습니다.' }
  }

  const rawReason = optionalString(body.reviewReason)
  if (rawReason === undefined || (rawReason && !(REVIEW_REASONS as readonly string[]).includes(rawReason))) {
    return { ok: false, error: '검토 사유 필터가 올바르지 않습니다.' }
  }

  const rawBodyFilter = optionalString(body.bodyFilter)
  if (rawBodyFilter === undefined || (rawBodyFilter && !(BODY_FILTERS as readonly string[]).includes(rawBodyFilter))) {
    return { ok: false, error: '본문 상태 필터가 올바르지 않습니다.' }
  }

  if (typeof body.todayOnly !== 'boolean') {
    return { ok: false, error: '오늘 수집 필터가 올바르지 않습니다.' }
  }

  const searchTerm = optionalString(body.searchTerm)
  if (searchTerm === undefined) {
    return { ok: false, error: '검색어 필터가 올바르지 않습니다.' }
  }
  if (searchTerm && searchTerm.length > 200) {
    return { ok: false, error: '검색어는 200자 이하여야 합니다.' }
  }

  const filters: BulkReviewFilters = {
    category,
    sourceId,
    reviewReason: rawReason as ReviewReason | null,
    bodyFilter: rawBodyFilter as ReviewBodyFilter | null,
    todayOnly: body.todayOnly,
    searchTerm,
  }

  if (!hasBulkReviewFilter(filters)) {
    return { ok: false, error: '전체 대상을 막기 위해 필터를 1개 이상 선택해야 합니다.' }
  }

  return {
    ok: true,
    value: {
      ...filters,
      action: 'reject',
      expectedCount: body.expectedCount,
    },
  }
}
