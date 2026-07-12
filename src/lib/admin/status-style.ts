export type Tone = 'positive' | 'risk' | 'negative' | 'neutral' | 'info'

export const TONE_BADGE_CLS: Record<Tone, string> = {
  positive: 'bg-positive-soft text-positive',
  risk:     'bg-risk-soft text-risk',
  negative: 'bg-negative-soft text-negative',
  neutral:  'bg-muted text-muted-foreground',
  info:     'bg-info-soft text-info',
}

// ─── 도메인 상태 → tone 매핑 (라벨은 각 컴포넌트가 보유, 여기선 색만) ────────────

export const CONTENT_STATUS_TONE = {
  published: 'positive',
  pending:   'risk',
  rejected:  'negative',
} as const

export const CONTENT_STATUS_LABEL = {
  published: '노출',
  pending:   '검토 대기',
  rejected:  '숨김',
} as const

// 검토 대기 사유 라벨 (178)
export const REVIEW_REASON_LABEL: Record<string, string> = {
  body_missing:   '본문 없음',
  body_short:     '본문 짧음(잘림 의심)',
  extract_failed: '본문 추출 실패',
  body_truncated: '본문 잘림',
  low_relevance:  '관련도 낮음',
  llm_irrelevant: 'AI 무관 판정',
  excluded_rule:  '제외 규칙',
}

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

export const KEY_INSIGHT_STATUS_TONE = {
  draft:        'neutral',
  needs_review: 'risk',
  published:    'positive',
  rejected:     'negative',
} as const

export const DAILY_INSIGHT_STATUS_TONE = {
  published: 'positive',
  rejected:  'negative',
} as const

// 작업 이력(job_runs, 289) — skipped(안 돌 이유가 있어 안 돎)는 실패가 아니다, 혼동 주의.
export const JOB_RUN_STATUS_TONE = {
  running:   'info',
  succeeded: 'positive',
  failed:    'negative',
  skipped:   'neutral',
} as const

export const JOB_RUN_STATUS_LABEL = {
  running:   '실행 중',
  succeeded: '성공',
  failed:    '실패',
  skipped:   '스킵',
} as const
