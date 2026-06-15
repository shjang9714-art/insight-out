/**
 * 품질 필터 (B1 — keyword_groups 가중 관련도)
 * 설계 근거: docs/묶음B-LLM양질엔진-설계.md §1·§2·§7
 */

/**
 * 제목+본문 합산 최소 글자수.
 */
export const MIN_EFFECTIVE_LENGTH = 30

/** 관련도 임계값: 이 값 미만이면 보류(pending) */
export const RELATEDNESS_THRESHOLD = 0.3

/**
 * 관련도 게이팅 활성화 여부.
 * true(B1~): 게이트 ON — threshold 미만은 pending(어드민 승인 큐).
 * trust_tier >= 2 소스는 면제.
 */
export const RELATEDNESS_GATING_ENABLED = true

/**
 * 광고성 패턴.
 */
const AD_PATTERNS: RegExp[] = [
  /\[?(광고|AD|sponsored|협찬|프로모션)\]?/i,
  /이 글은.*제공/,
  /바로가기.*클릭/,
]

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
 * keyword_groups 의 경량 표현 (DB 로드 후 crawlOne 에 전달).
 */
export interface ScoringGroup {
  name: string
  include_patterns: string[]
  exclude_patterns: string[]
  weight: number
  signal_hint: string | null
}

export interface KeywordMatch { groups: string[]; keywords: string[] }

const MAX_TAG_KEYWORDS = 8

/** keyword_groups include_patterns 매칭 → 그룹명 + 히트 키워드(중복제거·상한). 제목+본문 대상. */
export function matchKeywordGroups(title: string, body: string, groups: ScoringGroup[]): KeywordMatch {
  const text = `${title} ${body}`.toLowerCase()
  const groupSet = new Set<string>()
  const kwSet = new Set<string>()
  for (const g of groups) {
    if (g.weight <= 0) continue
    let hit = false
    for (const p of g.include_patterns) {
      if (text.includes(p.toLowerCase())) { kwSet.add(p); hit = true }
    }
    if (hit) groupSet.add(g.name)
  }
  return {
    groups: [...groupSet],
    keywords: [...kwSet].slice(0, MAX_TAG_KEYWORDS),
  }
}

/**
 * 도메인 무관 제목 여부 (keyword_groups.exclude_patterns 기반, 부분일치, 제목만 적용).
 * 어느 그룹의 exclude_patterns 중 하나라도 제목에 포함되면 true.
 * @param title 기사 제목(본문 전달 금지 — 오탐 원인).
 */
export function isExcludedByGroups(title: string, groups: ScoringGroup[]): boolean {
  const lower = title.toLowerCase()
  return groups.some(g =>
    g.exclude_patterns.some(p => lower.includes(p.toLowerCase()))
  )
}

/**
 * 가중 관련도 점수 (0~1 연속값).
 * - groups 가 비어 있으면 0 반환 → 게이트 ON 시 전부 pending 방지를 위해
 *   호출부에서 groups.length === 0 이면 면제 처리 권장.
 * - 제목 매칭 ×2, 본문 매칭 ×1, 그룹 weight 곱. 합산 후 RELATEDNESS_CAP 로 정규화.
 */
const RELATEDNESS_CAP = 3

export function relatednessScore(
  title: string,
  body: string,
  groups: ScoringGroup[]
): number {
  if (groups.length === 0) return 0
  const titleLower = title.toLowerCase()
  const bodyLower = body.toLowerCase()
  let total = 0
  for (const g of groups) {
    if (g.weight <= 0) continue  // 노이즈 그룹(weight 0) 점수 제외
    const t = g.include_patterns.filter(p => titleLower.includes(p.toLowerCase())).length
    const b = g.include_patterns.filter(p => bodyLower.includes(p.toLowerCase())).length
    if (t + b > 0) total += g.weight * (t * 2 + b)
  }
  return Math.min(total / RELATEDNESS_CAP, 1)
}
