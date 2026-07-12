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

/** rejected 사유별 세분화(312) — 합계는 CrawlCounts.rejected 와 일치해야 한다. */
export interface RejectedBy {
  ad: number             // 광고성(isAdLike)
  excludedGroup: number  // keyword_groups.exclude_patterns 매칭
  tooShort: number       // 유효 길이 미달(MIN_EFFECTIVE_LENGTH)
  bodyTooShort: number   // 본문 최소 길이 미달(crawl_settings.min_body_length)
  excludeRule: number    // 제외 규칙 action='reject'
}

export function zeroRejectedBy(): RejectedBy {
  return { ad: 0, excludedGroup: 0, tooShort: 0, bodyTooShort: 0, excludeRule: 0 }
}

/** 소스 1개 크롤 결과 카운터 */
export interface CrawlCounts {
  fetched: number     // 수집한 원시 건수
  inserted: number    // 신규 적재 건수 (status='published')
  duplicate: number   // 중복 스킵 건수 (미적재)
  held: number        // 보류 건수 (status='pending', #13)
  rejected: number    // 광고·짧은 글 제외 건수 (미적재, #13)
  rejectedBy: RejectedBy  // rejected 사유별 분해(312) — fetched = inserted+duplicate+held+rejected 가 맞아야 한다.
}
