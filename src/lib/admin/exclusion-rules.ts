import type { Tone } from '@/lib/admin/status-style'

// 190 — exclusion_rules 스키마·상태값 고정.

export type ExclusionRuleType = 'domain' | 'url_pattern' | 'title_pattern'
export type ExclusionAction = 'reject' | 'hold'

export interface ExclusionRuleRow {
  id: string
  rule_type: ExclusionRuleType
  value: string
  action: ExclusionAction
  is_active: boolean
  note: string | null
  hit_count: number
  last_hit_at: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export const EXCLUSION_RULE_TYPES: ExclusionRuleType[] = ['domain', 'url_pattern', 'title_pattern']
export const EXCLUSION_ACTIONS: ExclusionAction[] = ['reject', 'hold']

export const EXCLUSION_RULE_TYPE_LABEL: Record<ExclusionRuleType, string> = {
  domain:        '도메인',
  url_pattern:   'URL 패턴',
  title_pattern: '제목 패턴',
}

export const EXCLUSION_ACTION_LABEL: Record<ExclusionAction, string> = {
  reject: '미적재(거부)',
  hold:   '검토 대기(보류)',
}

// 상태색 — 175/180 톤(그린 없음): reject=negative(더 강함) · hold=risk
export const EXCLUSION_ACTION_TONE: Record<ExclusionAction, Tone> = {
  reject: 'negative',
  hold:   'risk',
}
