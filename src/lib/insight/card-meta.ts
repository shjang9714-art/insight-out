export type Importance = 'high' | 'mid' | 'low'
export type Relevance  = 'high' | 'mid' | 'low' | null

// 249 — 인사이트 카드 제목/카드 클릭 시 이동할 상세 경로 = 카드 자체 상세(핵심·시사점·근거).
// 기존(223)엔 첫 근거 기사로 점프해 "기업 동향"이 기사 1건으로 축소되는 문제가 있었음.
// id 없는 방어적 폴백만 근거 콘텐츠 → 토픽 타임라인.
export function getCardDetailHref(card: {
  id?: string
  topic: string
  source_content_ids: string[]
  citations: { content_id: string }[]
}): string {
  if (card.id) return `/dashboard/insights/${card.id}`
  const contentId = card.source_content_ids?.[0] ?? card.citations?.[0]?.content_id
  return contentId
    ? `/dashboard/contents/${contentId}`
    : `/dashboard/topics/${encodeURIComponent(card.topic)}`
}

// 중요도: citations 우선, 없으면 source_content_ids 수 기반
export function computeImportance(card: {
  citations: unknown[]
  source_content_ids: string[]
}): Importance {
  const n = (card.citations?.length || 0) || (card.source_content_ids?.length || 0)
  if (n >= 5) return 'high'
  if (n >= 2) return 'mid'
  return 'low'
}

// 내 관련도: 미설정 사용자 → null(미표시), 완전 매칭 → high, 부분 → mid, 없음 → low
export function computeRelevance(
  score: number,
  matched: boolean,
  hasPersonalization: boolean,
): Relevance {
  if (!hasPersonalization) return null
  if (matched) return 'high'
  if (score > 0) return 'mid'
  return 'low'
}

// 선정 이유: 규칙 조합 문구
export function buildSelectionReason(input: {
  evidenceCount: number
  matched: boolean
  generatedAt: string | null
}): string {
  const parts: string[] = []
  if (input.evidenceCount > 0) parts.push(`근거 ${input.evidenceCount}건`)
  if (input.matched) parts.push('관심 키워드 일치')
  if (input.generatedAt) {
    const days = Math.floor(
      (Date.now() - new Date(input.generatedAt).getTime()) / (1000 * 60 * 60 * 24),
    )
    if (days <= 7) parts.push('최근 생성')
  }
  return parts.join(' · ')
}

// ─── 배지 스타일 헬퍼 ──────────────────────────────────────────────────────────

export const IMPORTANCE_LABEL: Record<Importance, string> = {
  high: '중요도 높음',
  mid:  '중요도 중간',
  low:  '중요도 낮음',
}

export const IMPORTANCE_CLS: Record<Importance, string> = {
  high: 'bg-foreground/10 text-foreground',
  mid:  'bg-muted text-muted-foreground',
  low:  'text-muted-foreground/50',
}

export const RELEVANCE_LABEL: Record<'high' | 'mid', string> = {
  high: '내 관련도 높음',
  mid:  '내 관련도 중간',
}

export const RELEVANCE_CLS: Record<'high' | 'mid', string> = {
  high: 'bg-brand-600/10 text-brand-600',
  mid:  'bg-brand-600/5 text-brand-600/60',
}

// ─── 관련 키워드 (근거 콘텐츠 matched_keywords 합집합·빈도순) ─────────────────

export function computeRelatedKeywords(
  card: { topic: string; citations: unknown[]; source_content_ids: string[] },
  contentMap: Record<string, { matchedKeywords?: string[] | null }>,
  limit = 5,
): string[] {
  const ids = new Set<string>()
  for (const c of card.citations as { content_id: string }[]) ids.add(c.content_id)
  for (const id of card.source_content_ids) ids.add(id)

  const topicLower = card.topic.toLowerCase()
  const freq = new Map<string, number>()
  for (const id of ids) {
    for (const kw of contentMap[id]?.matchedKeywords ?? []) {
      if (kw.toLowerCase() === topicLower) continue
      freq.set(kw, (freq.get(kw) ?? 0) + 1)
    }
  }
  return [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([kw]) => kw)
}
