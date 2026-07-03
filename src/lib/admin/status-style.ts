export type Tone = 'positive' | 'risk' | 'negative' | 'neutral'

export const TONE_BADGE_CLS: Record<Tone, string> = {
  positive: 'bg-positive-soft text-positive',
  risk:     'bg-risk-soft text-risk',
  negative: 'bg-negative-soft text-negative',
  neutral:  'bg-muted text-muted-foreground',
}

// ─── 도메인 상태 → tone 매핑 (라벨은 각 컴포넌트가 보유, 여기선 색만) ────────────

export const CONTENT_STATUS_TONE = {
  published: 'positive',
  pending:   'risk',
  rejected:  'negative',
} as const

export const CRAWL_STATUS_TONE = {
  success: 'positive',
  partial: 'risk',
  failed:  'negative',
} as const

export const BRIEFING_STATUS_TONE = {
  published: 'positive',
  draft:     'neutral',
  archived:  'neutral',
  failed:    'negative',
} as const

export const ISSUE_STATUS_TONE = {
  published: 'positive',
  draft:     'neutral',
  archived:  'neutral',
} as const

export const INSIGHT_STATUS_TONE = {
  published: 'positive',
  draft:     'risk',
  archived:  'neutral',
} as const
