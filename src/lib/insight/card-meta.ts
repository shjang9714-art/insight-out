export type Importance = 'high' | 'mid' | 'low'
export type Relevance  = 'high' | 'mid' | 'low' | null

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
