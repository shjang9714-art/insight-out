// key_insights 테이블 행 타입 — API 응답과 카드 컴포넌트가 공유(server-only 아님).

export type KeyInsightStatus = 'draft' | 'needs_review' | 'published' | 'rejected'

export interface KeyInsightPastArticle {
  content_id?: string
  title: string
  url: string | null
  source: string
  published_at: string | null
  reason: string
}

export interface KeyInsightRow {
  id: string
  week_of: string
  status: KeyInsightStatus
  display_order: number | null
  is_featured: boolean
  category: string | null
  headline: string
  summary_ko: string
  implication: string | null
  source_name: string | null
  published_at: string | null
  source_url: string | null
  is_new: boolean
  needs_verify: boolean
  issue_id: string | null
  related_past: KeyInsightPastArticle[] | null
  created_at: string
  updated_at: string
}
