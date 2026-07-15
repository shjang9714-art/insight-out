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

/**
 * 지시서 20260716 — 자사 시사점 4갈래. 근거 없어 못 채운 필드는 키 자체를 생략(더미 금지) —
 * 그래서 전부 optional. action(실행 제안)만 창작 허용(사실 요소 제외), 나머지는 근거 기반.
 */
export interface ImplicationLenses {
  opportunity?: string
  risk?: string
  action?: string
  editorial?: string
}

/** 지시서 20260716 — 이 이슈의 "가능성 높은" 후속 전개 체인(예언 아님). 3~5단계, 근거 없으면 생략. */
export interface NextStep {
  step: string
  text: string
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
  /** 이 이슈가 산업적·비즈니스적으로 왜 중요한지 1~2문장(지시서 20260716). */
  why_it_matters: string | null
  implication_lenses: ImplicationLenses | null
  next_steps: NextStep[] | null
  created_at: string
  updated_at: string
}
