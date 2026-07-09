import type { SupabaseClient } from '@supabase/supabase-js'

export interface CompetitorWeeklyCitation {
  content_id: string
  quote: string
}

export interface CompetitorWeeklySection {
  area_key: string
  area_label: string
  moves: string
  companies: string[]
  impact: '위기' | '기회' | '관망'
  implication: string
  citations: CompetitorWeeklyCitation[]
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

const REPORT_COLUMNS = 'id, week_start, week_end, summary, overall_impact, emerging_topics, sections, status, generated_at'

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
