import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getWeekEndDate } from '@/lib/daily-insights/weeks'
import type { WeeklyFlowStep } from '@/lib/daily-insights/types'
import { stripLlmArtifacts } from '@/lib/text/strip-llm-artifacts'
import type { NewsletterTopTeaser } from '@/lib/email/newsletter-template'

export interface TopTeaserFlow {
  type: 'flow'
  /** 그 주 안에서 이 항목을 다시 고르지 않기 위한 소진 키. */
  key: string
  weekOf: string
  rank: number
  headline: string | null
  steps: WeeklyFlowStep[]
  /** 이 흐름이 본문에서 인용한 근거기사 id — 주간 기사 중복 배제(규칙 2)에 사용. */
  articleIds: string[]
}

export interface TopTeaserInsight {
  type: 'insight'
  key: string
  id: string
  headline: string
  summaryKo: string
  detailUrl: string
  /** 인사이트 티저는 개별 기사를 인라인 인용하지 않으므로 항상 빈 배열. */
  articleIds: string[]
}

export type TopTeaser = TopTeaserFlow | TopTeaserInsight

interface WeeklyFlowRawRow {
  week_of: string
  rank: number
  headline: string | null
  flow: WeeklyFlowStep[] | null
}

interface DailyInsightRawRow {
  id: string
  headline: string
  summary_ko: string
}

/**
 * 그 주(week_of, 월요일)의 최상단 후보 풀 — weekly_flows 전 행(rank) + daily_insights 전 행.
 * 흐름/인사이트가 몰리지 않도록 라운드로빈으로 섞어 결정론적 순서를 만든다(§규칙1).
 */
export async function buildTopTeaserPool(
  supabase: SupabaseClient,
  weekOf: string,
  baseUrl: string
): Promise<TopTeaser[]> {
  const [{ data: flowRows, error: flowErr }, { data: insightRows, error: insightErr }] = await Promise.all([
    supabase.from('weekly_flows').select('week_of, rank, headline, flow').eq('week_of', weekOf).order('rank', { ascending: true }),
    supabase
      .from('daily_insights')
      .select('id, headline, summary_ko')
      .eq('status', 'published')
      .eq('week_of', weekOf)
      .order('display_order', { ascending: true })
      .order('created_at', { ascending: false }),
  ])

  if (flowErr) console.error('[뉴스레터/최상단] 흐름 조회 실패:', flowErr.message)
  if (insightErr) console.error('[뉴스레터/최상단] 인사이트 조회 실패:', insightErr.message)

  const flows: TopTeaserFlow[] = ((flowRows ?? []) as WeeklyFlowRawRow[])
    .filter((r) => (r.flow ?? []).length > 0)
    .map((r) => ({
      type: 'flow',
      key: `flow:${r.week_of}:${r.rank}`,
      weekOf: r.week_of,
      rank: r.rank,
      headline: r.headline,
      steps: r.flow ?? [],
      articleIds: (r.flow ?? []).map((s) => s.article?.content_id).filter((id): id is string => !!id),
    }))

  const insights: TopTeaserInsight[] = ((insightRows ?? []) as DailyInsightRawRow[]).map((r) => ({
    type: 'insight',
    key: `insight:${r.id}`,
    id: r.id,
    headline: stripLlmArtifacts(r.headline),
    summaryKo: stripLlmArtifacts(r.summary_ko),
    detailUrl: `${baseUrl}/dashboard/daily-insights/${r.id}`,
    articleIds: [],
  }))

  const pool: TopTeaser[] = []
  const max = Math.max(flows.length, insights.length)
  for (let i = 0; i < max; i++) {
    if (flows[i]) pool.push(flows[i])
    if (insights[i]) pool.push(insights[i])
  }
  return pool
}

/**
 * 그 주 이미 발송된 회차들의 payload 에서 소진된 최상단 항목 키 + 노출된 기사 id 를 모은다.
 * 추가 테이블 없이 newsletter_issues.payload/content_ids 만 재사용(§규칙2 구현 메모).
 * 이번 회차 생성 시점엔 아직 오늘자 issue row 가 없으므로 이 조회만으로 "그 주 이전 회차"가 된다.
 */
export async function getWeeklyExposure(
  supabase: SupabaseClient,
  weekOf: string
): Promise<{ usedTeaserKeys: Set<string>; usedContentIds: Set<string> }> {
  const { data, error } = await supabase
    .from('newsletter_issues')
    .select('content_ids, payload')
    .gte('sent_on', weekOf)
    .lte('sent_on', getWeekEndDate(weekOf))
    .in('status', ['sent', 'partial'])

  if (error) {
    console.error('[뉴스레터/최상단] 주간 노출 이력 조회 실패:', error.message)
    return { usedTeaserKeys: new Set(), usedContentIds: new Set() }
  }

  const usedTeaserKeys = new Set<string>()
  const usedContentIds = new Set<string>()
  for (const row of (data ?? []) as { content_ids: string[] | null; payload: { topTeaser?: { key?: string } } | null }[]) {
    for (const id of row.content_ids ?? []) usedContentIds.add(id)
    const key = row.payload?.topTeaser?.key
    if (key) usedTeaserKeys.add(key)
  }
  return { usedTeaserKeys, usedContentIds }
}

/** 풀에서 아직 그 주에 안 쓴 첫 항목을 고른다. 다 소진했으면 null(그날은 최상단 생략, 재노출 금지). */
export function pickTopTeaser(pool: TopTeaser[], usedTeaserKeys: Set<string>): TopTeaser | null {
  return pool.find((item) => !usedTeaserKeys.has(item.key)) ?? null
}

/** PreparedNewsletterIssue.topTeaser(내부용, key/articleIds 포함) → 이메일 템플릿 입력 형태로 변환. */
export function toTemplateTopTeaser(teaser: TopTeaser | null): NewsletterTopTeaser | null {
  if (!teaser) return null
  if (teaser.type === 'insight') {
    return { type: 'insight', headline: teaser.headline, summaryKo: teaser.summaryKo, detailUrl: teaser.detailUrl }
  }
  return {
    type: 'flow',
    headline: teaser.headline,
    steps: teaser.steps.map((s) => ({
      phase: s.phase,
      text: stripLlmArtifacts(s.text),
      sourceUrl: s.article?.url ?? null,
      sourceName: s.article?.source && s.article.source !== '(미상)' ? s.article.source : null,
    })),
  }
}
