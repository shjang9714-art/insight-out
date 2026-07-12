import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'

// 313 — "이 기사를 인용한 리포트·인사이트" 역참조. LLM 호출 없음, 이미 적재된 근거를 조회만 한다.
// 4종 중 하나가 실패해도 나머지는 보여줘야 하므로 Promise.allSettled 로 서로 격리한다.

export interface CitationItem {
  id: string
  label: string
  href: string
}

export interface ContentCitations {
  reports: CitationItem[]
  issues: CitationItem[]
  insights: CitationItem[]
  briefings: CitationItem[]
}

const CITATION_FETCH_LIMIT = 10

function formatBriefingDate(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00`)
  if (isNaN(d.getTime())) return dateStr
  return d.toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul', month: 'long', day: 'numeric' })
}

/** 전략보고서 — ai_report_sources.content_id 역조회. 발행분(published_at not null)만. */
async function fetchReports(supabase: SupabaseClient, contentId: string): Promise<CitationItem[]> {
  const { data, error } = await supabase
    .from('ai_report_sources')
    .select('ai_reports!inner(id, title, published_at)')
    .eq('content_id', contentId)
    .not('ai_reports.published_at', 'is', null)
    .order('created_at', { ascending: false })
    .limit(CITATION_FETCH_LIMIT)
  if (error) throw error

  return (data ?? [])
    .map((row) => (row as unknown as { ai_reports: { id: string; title: string } | null }).ai_reports)
    .filter((r): r is { id: string; title: string } => r !== null)
    .map((r) => ({ id: r.id, label: r.title, href: `/dashboard/reports/${r.id}` }))
}

/** AI 인사이트(이슈) — issue_contents.content_id 역조회. published/archived만. */
async function fetchIssues(supabase: SupabaseClient, contentId: string): Promise<CitationItem[]> {
  const { data, error } = await supabase
    .from('issue_contents')
    .select('issues!inner(id, title, status)')
    .eq('content_id', contentId)
    .in('issues.status', ['published', 'archived'])
    .order('created_at', { ascending: false })
    .limit(CITATION_FETCH_LIMIT)
  if (error) throw error

  return (data ?? [])
    .map((row) => (row as unknown as { issues: { id: string; title: string } | null }).issues)
    .filter((r): r is { id: string; title: string } => r !== null)
    .map((r) => ({ id: r.id, label: r.title, href: `/dashboard/issues/${r.id}` }))
}

/** 기업 인사이트 — insight_cards.source_content_ids(uuid[]) 역조회(313 인덱스 대상). */
async function fetchInsights(supabase: SupabaseClient, contentId: string): Promise<CitationItem[]> {
  const { data, error } = await supabase
    .from('insight_cards')
    .select('id, headline, period_start')
    .contains('source_content_ids', [contentId])
    .in('status', ['published', 'archived'])
    .order('period_start', { ascending: false })
    .limit(CITATION_FETCH_LIMIT)
  if (error) throw error

  return ((data ?? []) as { id: string; headline: string }[])
    .map((r) => ({ id: r.id, label: r.headline, href: `/dashboard/insights/${r.id}` }))
}

/** 모닝브리핑 — briefings.source_content_ids(uuid[]) 역조회(313 인덱스 대상). */
async function fetchBriefings(supabase: SupabaseClient, contentId: string): Promise<CitationItem[]> {
  const { data, error } = await supabase
    .from('briefings')
    .select('id, title, briefing_date')
    .contains('source_content_ids', [contentId])
    .in('status', ['published', 'archived'])
    .order('briefing_date', { ascending: false })
    .limit(CITATION_FETCH_LIMIT)
  if (error) throw error

  return ((data ?? []) as { id: string; title: string | null; briefing_date: string }[])
    .map((r) => ({
      id: r.id,
      label: r.title ?? formatBriefingDate(r.briefing_date),
      href: `/dashboard/briefings?briefing=${r.id}`,
    }))
}

function pick(result: PromiseSettledResult<CitationItem[]>, label: string): CitationItem[] {
  if (result.status === 'fulfilled') return result.value
  console.error(`[역참조] ${label} 조회 실패(graceful, 나머지는 그대로 표시):`, result.reason)
  return []
}

/**
 * 콘텐츠 1건을 인용한 4종 산출물(전략보고서·AI인사이트·기업인사이트·모닝브리핑) 조회.
 * 병렬(allSettled) — 하나가 실패해도 나머지는 그대로 반환한다.
 */
export async function getContentCitations(
  supabase: SupabaseClient,
  contentId: string
): Promise<ContentCitations> {
  const [reports, issues, insights, briefings] = await Promise.allSettled([
    fetchReports(supabase, contentId),
    fetchIssues(supabase, contentId),
    fetchInsights(supabase, contentId),
    fetchBriefings(supabase, contentId),
  ])

  return {
    reports: pick(reports, '전략보고서'),
    issues: pick(issues, 'AI 인사이트'),
    insights: pick(insights, '기업 인사이트'),
    briefings: pick(briefings, '모닝브리핑'),
  }
}
