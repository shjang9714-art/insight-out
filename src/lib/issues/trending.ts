import type { SupabaseClient } from '@supabase/supabase-js'

// ─── 상수 ────────────────────────────────────────────────────────────────────
// 실측(2026-07-08): 48h 창 기준 26개 이슈가 임계 2건 이상 확보 — 값 튜닝 시 이 파일만 수정.

export const TRENDING_LIMIT = 8
const SURGE_CHANGE_PCT_THRESHOLD = 30

// ─── 타입 ────────────────────────────────────────────────────────────────────

interface TrendingKeywordRow {
  issue_id: string
  title: string
  recent_count: number
  prev_count: number
}

export interface TrendingKeyword {
  id: string
  title: string
  recentCount: number
  changePct: number | null
  changeFlag: 'surge' | null
}

// ─── 변환 ────────────────────────────────────────────────────────────────────

function toTrendingKeyword(row: TrendingKeywordRow): TrendingKeyword {
  const { recent_count: cur, prev_count: prev } = row
  const changePct = prev > 0 ? Math.round((cur - prev) / prev * 100) : (cur > 0 ? null : 0)
  const isSurge = cur > 0 && (changePct === null || changePct > SURGE_CHANGE_PCT_THRESHOLD)

  return {
    id: row.issue_id,
    title: row.title,
    recentCount: cur,
    changePct,
    changeFlag: isSurge ? 'surge' : null,
  }
}

// 뷰 미존재 오류 코드: 42P01(Postgres undefined_table), PGRST205(PostgREST 스키마 캐시에 없음)
const VIEW_MISSING_CODES = new Set(['42P01', 'PGRST205'])

/**
 * 홈 "실시간 급상승 키워드" — `trending_keywords` 뷰(48h 발행건수 desc, 임계·창은 뷰에 고정) 조회.
 * 뷰가 아직 적용되지 않았으면 null 반환 — 호출부에서 폴백 처리.
 */
export async function fetchTrendingKeywords(supabase: SupabaseClient): Promise<TrendingKeyword[] | null> {
  const { data, error } = await supabase
    .from('trending_keywords')
    .select('issue_id, title, recent_count, prev_count')
    .limit(TRENDING_LIMIT)

  if (error) {
    if (!VIEW_MISSING_CODES.has(error.code)) {
      console.error('[fetchTrendingKeywords] 조회 오류:', error.message)
    }
    return null
  }

  return ((data ?? []) as TrendingKeywordRow[])
    .map(toTrendingKeyword)
    .sort((a, b) => {
      if (b.recentCount !== a.recentCount) return b.recentCount - a.recentCount
      const aScore = a.changePct === null ? Infinity : a.changePct
      const bScore = b.changePct === null ? Infinity : b.changePct
      return bScore - aScore
    })
}
