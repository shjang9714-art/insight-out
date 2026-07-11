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

export interface DailyInsightRow {
  id: string
  day_of: string
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
  created_at: string
  updated_at: string
}
