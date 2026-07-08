/**
 * 품질 필터 (B1 — keyword_groups 가중 관련도)
 * 설계 근거: docs/묶음B-LLM양질엔진-설계.md §1·§2·§7
 */

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * 패턴 히트 판정 (109 — 단어경계 오탐 방지).
 * 짧은 영숫자 패턴(≤4자)은 단어경계로만 매칭 — "AI"가 "said"·"storage"에 오탐 차단.
 * 한글·공백 포함·5자+ 패턴은 기존 substring 유지.
 */
export function patternHit(textLower: string, pattern: string): boolean {
  const p = pattern.trim().toLowerCase()
  if (!p) return false
  if (/^[a-z0-9]{1,4}$/.test(p)) {
    return new RegExp(`(?<![a-z0-9])${escapeRegex(p)}(?![a-z0-9])`, 'i').test(textLower)
  }
  return textLower.includes(p)
}

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
 * 본문 최소 길이 기본값(221) — crawl_settings.min_body_length 미적용/조회 실패 시 폴백.
 */
export const DEFAULT_MIN_BODY_LENGTH = 250

/**
 * 순수 본문 길이(공백 정규화 후, 제목 제외). effectiveLength 와 달리 본문만 측정한다.
 */
export function bodyLength(body: string | null | undefined): number {
  return (body ?? '').trim().replace(/\s+/g, ' ').length
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
      if (patternHit(text, p)) { kwSet.add(p); hit = true }
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
    g.exclude_patterns.some(p => patternHit(lower, p))
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
    const t = g.include_patterns.filter(p => patternHit(titleLower, p)).length
    const b = g.include_patterns.filter(p => patternHit(bodyLower, p)).length
    if (t + b > 0) total += g.weight * (t * 2 + b)
  }
  return Math.min(total / RELATEDNESS_CAP, 1)
}

/**
 * 검토 대기 사유 (178 — 본문 품질 게이트 + 기존 관련도 게이트 통합 라벨).
 */
export type ReviewReason =
  | 'body_missing'    // 본문 없음/못 불러옴
  | 'body_short'      // 본문 과소(잘림 의심)
  | 'extract_failed'  // 풀본문 추출 실패
  | 'body_truncated'  // 말줄임·더보기 등 잘림 마커
  | 'low_relevance'   // 관련도 낮음(기존 게이트)
  | 'llm_irrelevant'  // LLM 재판정 무관
  | 'excluded_rule'   // 제외 규칙(190) 매칭 — hold 액션

/**
 * 본문 품질 판정. 문제 없으면 null.
 * 잘림 마커(…/더보기/read more 등) → body_truncated, 빈 본문 → body_missing,
 * 최소 길이 미달 → body_short. 보수적으로 명백한 누락/잘림만 잡는다.
 */
export function assessBodyQuality(
  body: string | null | undefined,
  opts?: { minLen?: number }
): ReviewReason | null {
  const text = (body ?? '').trim()
  if (!text) return 'body_missing'
  const min = opts?.minLen ?? 200
  if (/(…|\.\.\.|\[…\]|더보기|read more)\s*$/i.test(text)) return 'body_truncated'
  if (text.length < min) return 'body_short'
  return null
}

/**
 * 제외 규칙(190) — 도메인/URL/제목 부분일치(정규식 아님, 안전).
 */
export interface ExclusionRule {
  id: string
  rule_type: 'domain' | 'url_pattern' | 'title_pattern'
  value: string
  action: 'reject' | 'hold'
  is_active: boolean
}

function ruleHit(rule: ExclusionRule, host: string, urlLower: string, titleLower: string): boolean {
  const value = rule.value.trim().toLowerCase()
  if (!value) return false
  if (rule.rule_type === 'domain') {
    return host === value || host.endsWith(`.${value}`)
  }
  if (rule.rule_type === 'url_pattern') {
    return urlLower.includes(value)
  }
  return titleLower.includes(value)  // title_pattern
}

/**
 * 아이템을 활성 제외 규칙과 대조. reject 규칙이 hold 규칙보다 우선(더 엄격한 조치 우선 적용).
 * 순수 함수 — DB 접근 없음(rules 는 호출부가 1콜로 로드해 전달).
 */
export function matchExclusion(
  item: { title: string; url: string },
  rules: ExclusionRule[]
): { action: 'reject' | 'hold'; ruleId: string } | null {
  const active = rules.filter(r => r.is_active)
  if (active.length === 0) return null

  let host = ''
  try { host = new URL(item.url).hostname.toLowerCase() } catch { /* URL 파싱 실패 시 host 매칭만 스킵 */ }
  const urlLower = item.url.toLowerCase()
  const titleLower = item.title.toLowerCase()

  const rejectHit = active.find(r => r.action === 'reject' && ruleHit(r, host, urlLower, titleLower))
  if (rejectHit) return { action: 'reject', ruleId: rejectHit.id }

  const holdHit = active.find(r => r.action === 'hold' && ruleHit(r, host, urlLower, titleLower))
  if (holdHit) return { action: 'hold', ruleId: holdHit.id }

  return null
}

/** 이슈 자동배정 경량 표현 (DB 로드 후 processCrawlItem 에 전달). */
export interface IssueMatchDef {
  id: string
  match_keywords: string[]
}

/** 이슈 match_keywords 텍스트 부분일치 → 매칭된 issue_id 배열. matchKeywordGroups 미러. */
export function matchIssues(title: string, body: string, issues: IssueMatchDef[]): string[] {
  const text = `${title} ${body}`.toLowerCase()
  return issues
    .filter(issue => issue.match_keywords.some(kw => kw && text.includes(kw.toLowerCase())))
    .map(issue => issue.id)
}

