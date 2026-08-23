import type { EntityType } from '@/lib/types'

// 엔티티 타입 배지 (167 버킷 방식, 저채도 + dark 변형)
export const ENTITY_TYPE_CLS: Record<EntityType, string> = {
  company:  'bg-brand-600/10 text-brand-600',
  tech:     'bg-blue-500/10 text-blue-600 dark:text-blue-400',
  product:  'bg-violet-500/10 text-violet-600 dark:text-violet-400',
  person:   'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  policy:   'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  industry: 'bg-muted text-muted-foreground',
  org:      'bg-cyan-500/10 text-cyan-700 dark:text-cyan-300',
}

// 차트 시리즈 (recharts는 색 문자열 필요 → hex 단일 상수로 집약, 유일 예외)
export const CHART_CATEGORY: Record<string, string> = {
  뉴스: '#4f86c6',
  리포트: '#f4a261',
  웹인사이트: '#57cc99',
  유튜브: '#e76f51',
  'AI보고서': '#9b5de5',
}

// 콘텐츠 상태 분포 차트 (DashboardCharts 상태별 파이)
export const CHART_STATUS: Record<string, string> = {
  게시됨: '#57cc99',
  '검토 대기': '#f4a261',
  반려됨: '#e76f51',
}

export const CHART_BRAND = '#E6007E'
export const CHART_MUTED = '#94a3b8'
