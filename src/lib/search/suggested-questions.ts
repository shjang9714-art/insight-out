export interface SuggestedQuestionsCtx {
  watchlist: string[]
}

const DEFAULT_QUESTIONS = [
  '최근 경쟁사 동향은?',
  '이번 주 규제·정부 소식은?',
  'AI 데이터센터 관련 새 소식은?',
  '최근 통신 B2B 이슈는?',
]

export function buildSuggestedQuestions(
  ctx: SuggestedQuestionsCtx,
  topThemes: string[],
): string[] {
  const seen = new Set<string>()
  const results: string[] = []

  function add(q: string) {
    const key = q.trim().toLowerCase()
    if (!seen.has(key)) {
      seen.add(key)
      results.push(q.trim())
    }
  }

  // 1. 개인화 — 워치리스트 회사
  for (const company of ctx.watchlist.slice(0, 3)) {
    const display = company.charAt(0).toUpperCase() + company.slice(1)
    add(`${display} 최근 동향은?`)
  }

  // 2. 뜨는 토픽
  for (const theme of topThemes.slice(0, 3)) {
    add(`${theme} 정리해줘`)
  }

  // 3. 기본 템플릿
  for (const q of DEFAULT_QUESTIONS) {
    add(q)
  }

  return results.slice(0, 8)
}
