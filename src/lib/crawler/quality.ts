/**
 * 품질 필터 (#13)
 * 설계 근거: docs/phase2a-자동크롤링-상세설계.md §4 (PRD 4.5)
 */

/**
 * 제목+본문 합산 최소 글자수.
 * RSS 스니펫 현실(100~250자) 반영 — PRD "300자 풀본문 필터"는
 * 풀본문 enrichment 도입 후 적용 예정(백로그).
 */
export const MIN_EFFECTIVE_LENGTH = 30

/** 관련도 임계값: 이 값 미만이면 보류(pending, 어드민 승인 큐) */
export const RELATEDNESS_THRESHOLD = 0.3

/**
 * 광고성 패턴 (초기 상수).
 * admin 관리화(패턴 목록 DB화)는 #23 어드민 페이지 이후.
 */
const AD_PATTERNS: RegExp[] = [
  /\[?(광고|AD|sponsored|협찬|프로모션)\]?/i,
  /이 글은.*제공/,
  /바로가기.*클릭/,
]

/**
 * 광고성 텍스트 여부.
 * AD_PATTERNS 중 하나라도 매칭되면 true.
 */
export function isAdLike(text: string): boolean {
  return AD_PATTERNS.some(p => p.test(text))
}

/**
 * 유효 글자수: 제목 + 본문 공백 정규화 후 합산 길이.
 */
export function effectiveLength(title: string, body: string | null): number {
  const combined = `${title} ${body ?? ''}`.trim()
  return combined.replace(/\s+/g, ' ').length
}

/**
 * 키워드 관련도 점수 (0~1, 또는 null).
 * - keywords 가 비어 있으면 null 반환 → 게이팅 OFF(전부 published).
 *   (시드 키워드가 없으면 자동으로 OFF되어 아무것도 보류되지 않음)
 * - v1 이진 판정: 등록 키워드 중 하나라도 text 에 포함 → 1.0, 하나도 없으면 0.0.
 *   (빈도·위치 가중 정교화는 후속 작업)
 */
export function relatednessScore(text: string, keywords: string[]): number | null {
  if (keywords.length === 0) return null
  const lowerText = text.toLowerCase()
  const hit = keywords.some(kw => lowerText.includes(kw.toLowerCase()))
  return hit ? 1.0 : 0.0
}
