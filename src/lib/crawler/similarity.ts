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
