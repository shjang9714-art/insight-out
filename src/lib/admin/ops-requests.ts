import type { Tone } from '@/lib/admin/status-style'

// 187 — ops_requests 스키마·상태값. 188(MCP)이 같은 테이블을 read/write하므로
// 여기서 확정한 문자열(post_type/status/kind)을 그대로 재사용할 것 — 임의 변경 금지.

export type OpsPostType = 'request' | 'announcement' | 'work'
export type OpsRequestStatus = 'pending' | 'in_progress' | 'done' | 'blocked'
export type OpsAnnouncementStatus = 'active' | 'archived'
export type OpsRequestKind = 'sql' | 'infra' | 'config' | 'question' | 'share' | 'other'

export interface OpsRequestRow {
  id: string
  post_type: OpsPostType
  title: string
  body: string | null
  kind: OpsRequestKind
  status: string
  owner: string | null
  ref: string | null
  pinned: boolean
  created_by: string | null
  created_at: string
  updated_at: string
  resolved_at: string | null
  // 189 — work(작업) 항목 그룹핑/정렬. phase/seq 컬럼 미적용 환경에서는 null.
  phase: string | null
  seq: number | null
}

export const REQUEST_STATUSES: OpsRequestStatus[] = ['pending', 'in_progress', 'done', 'blocked']
export const ANNOUNCEMENT_STATUSES: OpsAnnouncementStatus[] = ['active', 'archived']
export const REQUEST_KINDS: OpsRequestKind[] = ['sql', 'infra', 'config', 'question', 'share', 'other']

export const REQUEST_STATUS_LABEL: Record<OpsRequestStatus, string> = {
  pending:     '대기',
  in_progress: '진행',
  done:        '완료',
  blocked:     '블록',
}

export const ANNOUNCEMENT_STATUS_LABEL: Record<OpsAnnouncementStatus, string> = {
  active:   '게시중',
  archived: '보관',
}

export const REQUEST_KIND_LABEL: Record<OpsRequestKind, string> = {
  sql:      'SQL',
  infra:    '인프라',
  config:   '설정',
  question: '질문',
  share:    '공유',
  other:    '기타',
}

// 상태색 — 175/180 톤(그린 없음): 완료=positive(블루) · 진행=info · 블록=risk · 대기=neutral
export const REQUEST_STATUS_TONE: Record<OpsRequestStatus, Tone> = {
  pending:     'neutral',
  in_progress: 'info',
  done:        'positive',
  blocked:     'risk',
}

export const ANNOUNCEMENT_STATUS_TONE: Record<OpsAnnouncementStatus, Tone> = {
  active:   'positive',
  archived: 'neutral',
}

/** 미완료(대기/진행) 상태 — 사이드바 배지 카운트 기준 */
export const OPEN_REQUEST_STATUSES: OpsRequestStatus[] = ['pending', 'in_progress']

// 189 — 작업(work) 신호등. 텍스트 이모지로만 표시(색상은 175/180 톤과 별개, 그린 없음).
export const STATUS_EMOJI: Record<OpsRequestStatus, string> = {
  pending:     '⚪',
  in_progress: '🟡',
  done:        '🟢',
  blocked:     '🔴',
}

export const UNPHASED_LABEL = '(미분류)'

/**
 * work 항목을 phase로 그룹핑 + seq 정렬(그룹 내부).
 * 그룹 순서는 그룹 내 최소 seq 기준 오름차순, 미분류(phase 없음)는 맨 뒤.
 * RequestsBoard(UI)와 worklog/export(API)가 동일 로직 공유 — 표시 일치.
 */
export function groupWorkByPhase(items: OpsRequestRow[]): [string, OpsRequestRow[]][] {
  const groups = new Map<string, OpsRequestRow[]>()
  for (const item of items) {
    const key = item.phase?.trim() || UNPHASED_LABEL
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(item)
  }
  for (const arr of groups.values()) {
    arr.sort((a, b) => (a.seq ?? Number.MAX_SAFE_INTEGER) - (b.seq ?? Number.MAX_SAFE_INTEGER))
  }
  return Array.from(groups.entries()).sort(([keyA, itemsA], [keyB, itemsB]) => {
    if (keyA === UNPHASED_LABEL) return 1
    if (keyB === UNPHASED_LABEL) return -1
    const minA = Math.min(...itemsA.map((i) => i.seq ?? Number.MAX_SAFE_INTEGER))
    const minB = Math.min(...itemsB.map((i) => i.seq ?? Number.MAX_SAFE_INTEGER))
    return minA - minB
  })
}
