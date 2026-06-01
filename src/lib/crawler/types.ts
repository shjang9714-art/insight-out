import type { SourceType } from '@/lib/types'

/** RSS/HTML 수집 결과 1건 (정규화 전 원시 데이터) */
export interface RawItem {
  original_url: string
  title: string
  body?: string
  author?: string
  published_at?: string   // ISO 문자열
  thumbnail_url?: string
  language?: string
}

/** 소스 타입별 수집 어댑터 인터페이스 */
export interface SourceAdapter {
  type: SourceType
  fetch(source: import('@/lib/types').Source, since: string): Promise<RawItem[]>
}

/** 소스 1개 크롤 결과 카운터 */
export interface CrawlCounts {
  fetched: number     // 수집한 원시 건수
  inserted: number    // 신규 적재 건수
  duplicate: number   // 중복 스킵 건수
  held: number        // 보류 건수 — 이번(#4)엔 항상 0, #13에서 사용
}
