import type { SupabaseClient } from '@supabase/supabase-js'
import { stripLlmArtifacts } from '@/lib/text/strip-llm-artifacts'

export interface IssueRow {
  id: string
  title: string
  summary: string | null
}

export interface IssueCard {
  id: string
  title: string
  summary: string | null
  recentCount: number
  prevCount: number
  changePct: number | null
  sentimentPos: number
  sentimentNeg: number
  total: number
  // 105 추가
  prevNeg: number
  sentimentWorsening: boolean
  changeFlag: 'surge' | 'worsening' | null
  // 172 추가 — 근거 콘텐츠 matched_keywords 빈도 상위 4
  topKeywords: string[]
  // 173 추가 — 근거 콘텐츠 collected_at 최댓값(최신 정렬용)
  lastActivityAt: string | null
}

interface IssueActivityStat {
  issue_id: string
  total_30d: number
  cur_7d: number
  prev_7to13d: number
  last_activity_at: string | null
  top_keywords: string[]
  refreshed_at: string
}

// ─── 종합 랭킹 점수 ──────────────────────────────────────────────────────────────────────────────
// 신규(changePct=null)를 무한대로 최상단에 두던 방식을 폐기하고, 세 신호를 합산한다.
//  ① 볼륨   — 이번 주 실제 기사 수(log 완화). 1~2건짜리 신규가 톱을 먹지 못하게.
//  ② 관련도 — 누적 매칭 기사 수(log). 플랫폼이 꾸준히 다루는 '중심' 이슈일수록 가점.
//             (issues 테이블에 테마 컬럼이 없어 '지속적으로 다뤄진 정도'를 관련도 프록시로 사용)
//  ③ 속도   — 급증률. 신규는 무한대가 아닌 고정 가점(80)으로, 수치는 200%로 상한.
//             표본이 작으면(이번 주 <5건) 속도 신뢰도를 낮춰 소표본 폭주를 억제.
export function rankScore(c: IssueCard): number {
  const volume     = Math.log1p(c.recentCount)                       // 볼륨
  const relevance  = Math.log1p(c.total)                             // 관련도(중심성)
  const rawVel     = c.changePct === null ? 80 : Math.max(c.changePct, 0)
  const velocity   = Math.min(rawVel, 200) / 100                     // 속도 0~2.0
  const confidence = Math.min(c.recentCount, 5) / 5                  // 소표본 신뢰도 0.2~1.0
  return volume * 1.0 + relevance * 0.6 + velocity * confidence * 1.2
}

export function buildIssueCards(
  issues: IssueRow[],
  stats: Map<string, IssueActivityStat>,
): IssueCard[] {
  const cards: IssueCard[] = issues.map((issue) => {
    const s = stats.get(issue.id)
    const cur = s?.cur_7d ?? 0
    const prev = s?.prev_7to13d ?? 0
    const changePct = prev > 0 ? Math.round((cur - prev) / prev * 100) : (cur > 0 ? null : 0)
    const isSurge = cur > 0 && (changePct === null || changePct > 30)

    return {
      id: issue.id,
      title: stripLlmArtifacts(issue.title),
      summary: issue.summary ? stripLlmArtifacts(issue.summary) : issue.summary,
      recentCount: cur,
      prevCount: prev,
      changePct,
      sentimentPos: 0,
      sentimentNeg: 0,
      prevNeg: 0,
      sentimentWorsening: false,
      total: s?.total_30d ?? 0,
      changeFlag: isSurge ? 'surge' : null,
      topKeywords: s?.top_keywords ?? [],
      lastActivityAt: s?.last_activity_at ?? null,
    }
  })

  return cards.sort((a, b) => {
    const s = rankScore(b) - rankScore(a)
    if (s !== 0) return s
    return b.recentCount - a.recentCount   // 동점: 이번 주 건수 많은 순
  })
}

// ─── 페치 헬퍼 ───────────────────────────────────────────────────────────────────────────────

export async function fetchIssueActivity(supabase: SupabaseClient): Promise<IssueCard[]> {
  const [{ data: issuesData }, { data: statsData, error: statsError }] = await Promise.all([
    supabase.from('issues').select('id, title, summary')
      .eq('status', 'published').order('created_at', { ascending: false }),
    supabase.rpc('issue_activity'),
  ])
  if (statsError) console.error('[이슈 활동도] 집계 조회 오류:', statsError.message)

  const issues = (issuesData ?? []) as IssueRow[]
  const stats = new Map<string, IssueActivityStat>(
    ((statsData ?? []) as IssueActivityStat[]).map((row) => [row.issue_id, row]),
  )
  return buildIssueCards(issues, stats)
}
