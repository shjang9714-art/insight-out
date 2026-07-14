import type { SupabaseClient } from '@supabase/supabase-js'

export interface CompetitorWeeklyCitation {
  content_id: string
  quote: string
}

// ─── 348: 애널리스트 프레임 슬롯 ──────────────────────────────────────────────
// 해석을 LLM 자유서술에 맡기지 않고 슬롯으로 고정한다.
// 전부 optional — 과거 리포트(레거시 moves/implication)는 그대로 렌더된다.

/** 패스① 사실 추출 산출물. 해석 금지 — 근거 참조 키(evt_id)로 쓰인다. */
export interface WeeklyEvent {
  id: string
  date: string
  actor: string
  event: string
  numbers?: Record<string, string>
  content_id: string
  source_name?: string
}

/** 현황 — 명제형 꼭지 한 줄 + 설명 + 근거 */
export interface WeeklyStatusPoint {
  thesis: string
  detail: string
  evidence: string[]
}

/** 의도 분석 — 무엇을 확보하려 하는가 / 왜 지금인가 */
export interface WeeklyIntent {
  actor: string
  seeking: string
  reading: string
  evidence: string[]
}

/** 비대칭 — 그쪽이 가진 것 / 우리가 가진 것 */
export interface WeeklyAsymmetry {
  theirs: string
  ours: string
  evidence: string[]
}

export interface WeeklyOption {
  action: string
  rationale: string
  cost?: '상' | '중' | '하'
}

/** 지켜볼 지표 — 반증 가능한 형태여야 한다("~하면 이 판단이 맞다") */
export interface WeeklyWatchMetric {
  metric: string
  if_then: string
  due?: string
}

// 지시서의 데이터 계약 명칭도 함께 노출한다. Weekly* 명칭은 내부 기존 참조 호환용이다.
export type StatusPoint = WeeklyStatusPoint
export type Intent = WeeklyIntent
export type IntentRead = WeeklyIntent
export type Asymmetry = WeeklyAsymmetry
export type Option = WeeklyOption
export type WatchMetric = WeeklyWatchMetric

export interface CompetitorWeeklySection {
  area_key: string
  area_label: string
  moves: string
  companies: string[]
  impact: '위기' | '기회' | '관망'
  implication: string
  citations: CompetitorWeeklyCitation[]

  // 348 신규(optional)
  events?: WeeklyEvent[]
  overview?: string
  status_points?: WeeklyStatusPoint[]
  intents?: WeeklyIntent[]
  conflict_areas?: string[]
  asymmetry?: WeeklyAsymmetry
  options?: WeeklyOption[]
  watch_metrics?: WeeklyWatchMetric[]
}

/** 348: 분석(패스②)이 들어간 섹션인가 — 렌더 분기 기준 */
export function hasAnalysis(section: CompetitorWeeklySection): boolean {
  return (section.status_points?.length ?? 0) > 0 || (section.intents?.length ?? 0) > 0
}

export interface CompetitorWeeklyReportRow {
  id: string
  week_start: string
  week_end: string
  summary: string | null
  overall_impact: '위기' | '기회' | '관망' | null
  emerging_topics: string[]
  sections: CompetitorWeeklySection[]
  status: 'draft' | 'published'
  generated_at: string
}

export interface CompetitorWeeklyTimelineEntry {
  week_start: string
  week_end: string
  overall_impact: '위기' | '기회' | '관망' | null
}

export interface CompetitorWeeklyCardRow {
  id: string
  week_start: string
  week_end: string
  summary: string | null
  overall_impact: '위기' | '기회' | '관망' | null
  emerging_topics: string[]
  /** 345: 카드에 사업영역별 핵심 동향을 2줄 노출하기 위해 함께 조회(제목만으로는 클릭 유도가 약함) */
  sections: CompetitorWeeklySection[]
}

const REPORT_COLUMNS = 'id, week_start, week_end, summary, overall_impact, emerging_topics, sections, status, generated_at'
const CARD_COLUMNS = 'id, week_start, week_end, summary, overall_impact, emerging_topics, sections'

/** 최신 published 주간 리포트 1건. 261 SQL 미적용(42P01)이면 null(graceful). */
export async function getLatestPublishedCompetitorWeeklyReport(
  supabase: SupabaseClient,
): Promise<CompetitorWeeklyReportRow | null> {
  const { data, error } = await supabase
    .from('competitor_weekly_reports')
    .select(REPORT_COLUMNS)
    .eq('status', 'published')
    .order('week_start', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    if (error.code !== '42P01') console.warn('[CompetitorWeekly] 최신 리포트 조회 실패:', error.message)
    return null
  }
  return (data as CompetitorWeeklyReportRow | null) ?? null
}

/** 특정 주(week_start=YYYY-MM-DD) published 리포트 1건. */
export async function getCompetitorWeeklyReportByWeek(
  supabase: SupabaseClient,
  weekStart: string,
): Promise<CompetitorWeeklyReportRow | null> {
  const { data, error } = await supabase
    .from('competitor_weekly_reports')
    .select(REPORT_COLUMNS)
    .eq('status', 'published')
    .eq('week_start', weekStart)
    .maybeSingle()

  if (error) {
    if (error.code !== '42P01') console.warn('[CompetitorWeekly] 주간 리포트 조회 실패:', error.message)
    return null
  }
  return (data as CompetitorWeeklyReportRow | null) ?? null
}

/** 카드형 목록(283)용 — published 주간 리포트 최근 N건(최신순). 261 SQL 미적용(42P01)이면 []. */
export async function getPublishedCompetitorWeeklyReports(
  supabase: SupabaseClient,
  limit = 12,
): Promise<CompetitorWeeklyCardRow[]> {
  const { data, error } = await supabase
    .from('competitor_weekly_reports')
    .select(CARD_COLUMNS)
    .eq('status', 'published')
    .order('week_start', { ascending: false })
    .limit(limit)

  if (error) {
    if (error.code !== '42P01') console.warn('[CompetitorWeekly] 카드 목록 조회 실패:', error.message)
    return []
  }
  return (data ?? []) as CompetitorWeeklyCardRow[]
}

/** 타임라인용 — 과거 published 주간 리포트 요약 목록(최신순). */
export async function getCompetitorWeeklyTimeline(
  supabase: SupabaseClient,
  limit = 12,
): Promise<CompetitorWeeklyTimelineEntry[]> {
  const { data, error } = await supabase
    .from('competitor_weekly_reports')
    .select('week_start, week_end, overall_impact')
    .eq('status', 'published')
    .order('week_start', { ascending: false })
    .limit(limit)

  if (error) {
    if (error.code !== '42P01') console.warn('[CompetitorWeekly] 타임라인 조회 실패:', error.message)
    return []
  }
  return (data ?? []) as CompetitorWeeklyTimelineEntry[]
}
