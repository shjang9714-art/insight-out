import type { KeywordItem } from '@/lib/tag-buckets'

export type KeywordRankingMode = 'rising' | 'new' | 'sustained'

const MAX_RANKED_KEYWORDS = 10

export function rankKeywords(
  keywords: KeywordItem[],
  mode: KeywordRankingMode,
): KeywordItem[] {
  return keywords
    .filter(keyword => {
      if (mode === 'rising') return !keyword.isNew && (keyword.changePct ?? 0) > 0
      if (mode === 'new') return keyword.isNew
      return (keyword.cur ?? 0) > 0 && (keyword.prev ?? 0) > 0
    })
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
