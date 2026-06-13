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
 * 관련도 게이팅 활성화 여부.
 * false(현재): 게이트 OFF — 모든 기사를 published 로 적재, 태깅만 수행.
 * 키워드 커버리지 충분 + 어드민 승인 큐 구축 후 true 로 전환.
 */
export const RELATEDNESS_GATING_ENABLED = false

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
 * 도메인 무관(B2B 텔레콤/엔터프라이즈와 무관) 기사 제외 패턴.
 * - 제목에만 적용한다(본문 적용 금지 — 오탐 원인).
 * - 게이트(RELATEDNESS_GATING_ENABLED)와 무관한 하드 reject.
 * - 보수적으로 시작: 명백한 연예·스포츠·부동산·운세·복권 류만.
 *   애매하면 추가하지 말 것(양질 기사 손실 방지).
 * - 추후 어드민에서 편집 가능하도록 filter_patterns 테이블로 이전 예정(묶음 A 후속).
 */
const EXCLUDE_TITLE_PATTERNS: RegExp[] = [
  // 연예·가십
  /(연예|아이돌|걸그룹|보이그룹|데뷔무대|열애설|결별설|이혼설|컴백 무대)/,
  // 스포츠 — "프로축구단 후원" 같은 B2B 맥락 오탐 방지: 프로축구(?!단)
  /(프로야구|KBO|프로축구(?!단)|K리그|국가대표.*(축구|야구)|골프 대회|승부조작|MVP 수상)/i,
  // 부동산
  /(아파트 분양|청약 경쟁률|전세사기|매매가|집값 (상승|하락))/,
  // 운세·복권·날씨
  /(오늘의 운세|로또 \d+회|복권 당첨|주간 날씨|미세먼지 농도)/,
]

/**
 * 도메인 무관 제목 여부. EXCLUDE_TITLE_PATTERNS 중 하나라도 매칭되면 true.
 * @param title 기사 제목(본문 넣지 말 것).
 */
export function isExcludedTitle(title: string): boolean {
  return EXCLUDE_TITLE_PATTERNS.some(p => p.test(title))
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
