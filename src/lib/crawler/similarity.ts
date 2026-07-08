/**
 * 제목 유사도 — 토큰 기반 Jaccard 유사도 (외부 라이브러리 없이 자가 구현)
 * 설계 근거: docs/phase2a-자동크롤링-상세설계.md §3.1 A안
 */

/** near-duplicate 판정 임계값 (이 값 이상이면 관련 기사로 그룹핑) */
export const SIMILARITY_THRESHOLD = 0.9

/**
 * 기사 제목에서 의미 없는 단일 조사·접속사 불용어 집합.
 * 공백 기준 토큰화이므로 단어 앞뒤에 붙은 경우는 아래 기호 제거 후 걸러짐.
 */
const STOPWORDS = new Set([
  '의', '이', '가', '은', '는', '을', '를', '에', '에서',
  '로', '으로', '와', '과', '도', '만', '등', '및', '그',
])

/**
 * 제목을 토큰 배열로 변환.
 * - 소문자화
 * - 공백 기준 분리
 * - 한글·영숫자 이외 기호 제거
 * - 1글자 토큰·불용어 제거
 */
export function tokenize(title: string): string[] {
  return title
    .toLowerCase()
    .split(/\s+/)
    .map(t => t.replace(/[^\w가-힣]/g, ''))   // 기호 제거 (한글·영숫자·밑줄 유지)
    .filter(t => t.length > 1 && !STOPWORDS.has(t))
}

/**
 * 두 토큰이 soft-match 되는지 확인.
 * 완전 일치이거나, 한쪽이 다른 쪽의 접두사(한국어 형태 변형 대응, 최소 2글자)이면 일치로 간주.
 * 예) "호조" ↔ "호조세", "투자" ↔ "투자자" 등.
 */
function softMatch(a: string, b: string): boolean {
  if (a === b) return true
  if (a.length >= 2 && b.startsWith(a)) return true
  if (b.length >= 2 && a.startsWith(b)) return true
  return false
}

/**
 * Soft Jaccard 유사도.
 * 교집합 계산 시 softMatch 를 사용해 형태 변형 토큰도 매칭.
 * 두 집합 모두 비어 있으면 1.0 반환.
 */
export function jaccard(a: string[], b: string[]): number {
  if (a.length === 0 && b.length === 0) return 1.0
  // soft 교집합: a 의 각 토큰이 b 에 soft-match 되는 쌍 수 (1:1 매칭)
  const usedB = new Set<number>()
  let intersection = 0
  for (const ta of a) {
    for (let i = 0; i < b.length; i++) {
      if (!usedB.has(i) && softMatch(ta, b[i])) {
        intersection++
        usedB.add(i)
        break
      }
    }
  }
  // 합집합 = |A| + |B| - intersection
  const union = a.length + b.length - intersection
  return union === 0 ? 0 : intersection / union
}

/**
 * 두 제목의 유사도 (0 ~ 1).
 * 유효 토큰이 2개 미만인 짧은 제목은 false-positive 방지를 위해 0 반환.
 */
export function titleSimilarity(t1: string, t2: string): number {
  const tokensA = tokenize(t1)
  const tokensB = tokenize(t2)
  // 토큰이 너무 적으면 유사도 판정 불신뢰 → 0 반환
  if (tokensA.length < 2 || tokensB.length < 2) return 0
  return jaccard(tokensA, tokensB)
}

/**
 * Google News 등 RSS 제목 끝의 출처 접미사(` - 매체명` / ` | 매체명`)를 제거한다.
 * 보수적 정규식: 매체명이 1~25자이고 하이픈·파이프가 없을 때만 제거.
 * 미매칭이면 원본 유지(trim 만).
 */
export function stripSourceSuffix(title: string): string {
  // " - 매체명" 또는 " | 매체명" — 끝의 25자 이하 단일 세그먼트만 제거
  return title.replace(/\s[-|]\s[^-|–—]{1,25}\s*$/, '').trim()
}

/** 핵심 토큰 공유 판정 최소 공유 토큰 수 */
export const CORE_MIN_SHARED = 3
/** 핵심 토큰 공유 판정 최소 비율(공유 수 / 짧은 쪽 토큰 수) */
export const CORE_MIN_RATIO = 0.5

/**
 * 두 제목이 핵심 토큰을 충분히 공유하는지 판정.
 * - soft-match 교집합 ≥ CORE_MIN_SHARED
 * - 교집합 / min(lenA, lenB) ≥ CORE_MIN_RATIO
 * - 유효 토큰이 3개 미만인 짧은 제목은 false 반환(오탐 방지)
 */
export function sharesCoreTokens(t1: string, t2: string): boolean {
  const tokensA = tokenize(t1)
  const tokensB = tokenize(t2)
  if (tokensA.length < 3 || tokensB.length < 3) return false

  // soft 교집합 (jaccard 와 동일 로직, 개수만 반환)
  const usedB = new Set<number>()
  let shared = 0
  for (const ta of tokensA) {
    for (let i = 0; i < tokensB.length; i++) {
      if (!usedB.has(i) && softMatch(ta, tokensB[i])) {
        shared++
        usedB.add(i)
        break
      }
    }
  }

  const minLen = Math.min(tokensA.length, tokensB.length)
  return shared >= CORE_MIN_SHARED && shared / minLen >= CORE_MIN_RATIO
}

// ─── 본문 어휘 유사도(220) — 제목만으론 못 잡는 같은 사건 병합 ───────────────────

/** 본문 유사도 계산 시 사용할 앞부분 문자 상한(전체를 보지 않아도 어휘 분포는 충분히 드러남) */
const BODY_TOKEN_CHAR_LIMIT = 1500
/** 본문 유사도 판정 최소 토큰 수 — 미만이면 신뢰 불가로 0 반환 */
const BODY_MIN_TOKENS = 8

/** 본문 유사도 임계값 — 이 값 이상이면 어휘가 강하게 겹침(같은 사건 가능성 높음) */
export const BODY_SIM_THRESHOLD = 0.5
/** 제목 유사도가 완전일치 기준(0.9)엔 못 미치지만 본문 결합 판정에 쓸 완화 임계값 */
export const TITLE_SOFT_FOR_BODY = 0.55

/** 본문을 토큰 배열로 변환(tokenize 재사용, 앞부분만 사용). */
export function bodyTokens(body: string): string[] {
  return tokenize(body.slice(0, BODY_TOKEN_CHAR_LIMIT))
}

/**
 * 두 본문의 어휘 유사도(0~1). 토큰이 너무 적으면(BODY_MIN_TOKENS 미만) 0 반환(오탐 방지).
 */
export function bodySimilarity(b1: string, b2: string): number {
  const tokensA = bodyTokens(b1)
  const tokensB = bodyTokens(b2)
  if (tokensA.length < BODY_MIN_TOKENS || tokensB.length < BODY_MIN_TOKENS) return 0
  return jaccard(tokensA, tokensB)
}

/**
 * near-dup 결합 판정(220) — 기존 제목 기준(완전일치·핵심토큰 공유) 또는
 * 제목 부분일치 + 본문 강한 일치(같은 사건, 다른 제목)를 같은 클러스터로 판정.
 * hasBody=false 면 본문 판정을 건너뛴다(삽입 hot-path는 RSS 스니펫뿐이라 기존 제목 판정만 적용).
 */
export function isNearDup(
  a: { title: string; body?: string | null },
  b: { title: string; body?: string | null },
  hasBody: boolean
): boolean {
  if (titleSimilarity(a.title, b.title) >= SIMILARITY_THRESHOLD) return true
  if (sharesCoreTokens(a.title, b.title)) return true
  if (!hasBody) return false

  const titleSoft = titleSimilarity(a.title, b.title) >= TITLE_SOFT_FOR_BODY
  if (!titleSoft) return false
  return bodySimilarity(a.body ?? '', b.body ?? '') >= BODY_SIM_THRESHOLD
}
