// 일일 종합 인사이트의 근거기사·과거기사 유사중복 제거(§3 절대 규칙) — 순수 함수, DB/서버 의존 없음.
// candidates.ts 의 이슈 클러스터 dedup(같은 사건 근접중복)과는 별개 레이어: 여기는 "여러 사건을
// 묶어 하나의 그룹으로 만든 뒤" 그 그룹 안에 남을 수 있는 잔여 근접중복(다른 이슈 클러스터로 잡혔지만
// 실제로는 같은 사건을 다루는 기사 등)을 걸러내는 최종 백스톱이다.

const STOPWORD_RE = /["'“”‘’.,!?…()\[\]{}·:;\-–—/\\|]/g

function normalizeTitle(title: string): string {
  return title.replace(STOPWORD_RE, ' ').replace(/\s+/g, ' ').trim().toLowerCase()
}

/** 제목을 공백 기준 토큰 집합으로. 한국어는 형태소 분석 없이 어절 단위로 충분(근접중복 백스톱 용도). */
export function titleTokens(title: string): Set<string> {
  return new Set(normalizeTitle(title).split(' ').filter((t) => t.length > 0))
}

export function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0
  let intersection = 0
  for (const t of a) {
    if (b.has(t)) intersection++
  }
  const union = a.size + b.size - intersection
  return union === 0 ? 0 : intersection / union
}

export function extractDomain(url: string | null): string | null {
  if (!url) return null
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return null
  }
}

export interface DedupableArticle {
  contentId: string
  title: string
  url: string | null
  publishedAt: string | null
}

const JACCARD_THRESHOLD = 0.6
const JACCARD_SAME_DOMAIN_THRESHOLD = 0.4

/**
 * 제목 토큰 자카드 유사도 + 동일 도메인 백스톱으로 근접중복 제거.
 * publishedAt 최신(또는 최신 정보 없으면 입력 순서상 먼저 온 것) 1건만 대표로 남긴다.
 */
export function dedupeSimilarArticles<T extends DedupableArticle>(items: readonly T[]): T[] {
  const sorted = [...items].sort((a, b) => {
    const at = a.publishedAt ? new Date(a.publishedAt).getTime() : 0
    const bt = b.publishedAt ? new Date(b.publishedAt).getTime() : 0
    return bt - at
  })

  const kept: { item: T; tokens: Set<string>; domain: string | null }[] = []

  for (const item of sorted) {
    const tokens = titleTokens(item.title)
    const domain = extractDomain(item.url)
    const isDuplicate = kept.some((k) => {
      const sim = jaccardSimilarity(tokens, k.tokens)
      if (sim >= JACCARD_THRESHOLD) return true
      if (domain && domain === k.domain && sim >= JACCARD_SAME_DOMAIN_THRESHOLD) return true
      return false
    })
    if (!isDuplicate) kept.push({ item, tokens, domain })
  }

  return kept.map((k) => k.item)
}
