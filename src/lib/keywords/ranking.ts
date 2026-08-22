import type { KeywordItem } from '@/lib/tag-buckets'

export type KeywordRankingMode = 'rising' | 'new' | 'sustained'
export type KeywordTrendClass = KeywordRankingMode | 'falling' | 'none'

/** 관심 지속 완충폭(%) — 이 안이면 "변화 없음"으로 본다. David 결정 2026-08-22. */
export const SUSTAINED_BAND_PCT = 20

const MAX_RANKED_KEYWORDS = 10

export function classifyKeyword(keyword: KeywordItem): KeywordTrendClass {
  const cur = keyword.cur ?? 0
  const prev = keyword.prev ?? 0
  if (prev === 0) return cur > 0 ? 'new' : 'none'
  const changePct = ((cur - prev) / prev) * 100
  if (changePct > SUSTAINED_BAND_PCT) return 'rising'
  if (changePct < -SUSTAINED_BAND_PCT) return 'falling'
  return 'sustained'
}

export function rankKeywords(
  keywords: KeywordItem[],
  mode: KeywordRankingMode,
): KeywordItem[] {
  return keywords
    .filter(keyword => classifyKeyword(keyword) === mode)
    .sort((a, b) => {
      if (mode === 'sustained') {
        const totalDiff = ((b.cur ?? 0) + (b.prev ?? 0)) - ((a.cur ?? 0) + (a.prev ?? 0))
        if (totalDiff !== 0) return totalDiff
      }
      const changeDiff = (b.changePct ?? 0) - (a.changePct ?? 0)
      if (changeDiff !== 0) return changeDiff
      return (b.cur ?? 0) - (a.cur ?? 0)
    })
    .slice(0, MAX_RANKED_KEYWORDS)
}
