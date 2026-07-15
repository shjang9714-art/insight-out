// daily_insights 테이블 행 타입 — API 응답과 카드/상세 컴포넌트가 공유(server-only 아님).

export type DailyInsightStatus = 'published' | 'rejected'

export interface DailyInsightSourceArticle {
  content_id: string
  title: string
  url: string | null
  source: string
  published_at: string | null
}

export interface DailyInsightPastArticle extends DailyInsightSourceArticle {
  reason: string
}

/** §2.5① 경쟁 구도 매트릭스 행 — 근거 기사에 실제 등장한 사업자만. 근거 부족 칸은 "—". */
export interface CompetitorMatrixEntry {
  company: string
  move: string
  edge: string
  risk: string
}

export interface DailyInsightRow {
  id: string
  day_of: string
  /** 배치 주차 키(월요일, KST). 지시서 20260715 이전 행은 백필값, 이후 행은 day_of와 동일. */
  week_of: string | null
  status: DailyInsightStatus
  needs_review: boolean
  display_order: number
  category: string | null
  headline: string
  summary_ko: string
  market_trend: string | null
  competitor_trend: string | null
  implication: string | null
  source_articles: DailyInsightSourceArticle[] | null
  related_past: DailyInsightPastArticle[] | null
  competitor_matrix: CompetitorMatrixEntry[] | null
  created_at: string
  updated_at: string
}
