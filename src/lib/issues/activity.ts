import type { SupabaseClient } from '@supabase/supabase-js'

// ─── 타입 ──────────────────────────────────────────────────────────────────

export interface IssueRow {
  id: string
  title: string
  summary: string | null
}

export interface ActivityRow {
  issue_id: string
  contents: {
    collected_at: string
    sentiment: '긍정' | '중립' | '부정' | null
    matched_keywords: string[] | null
  } | null
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
}

// ─── KST 헬퍼 ──────────────────────────────────────────────────────────────

export function getKstTodayStartMs(): number {
  const now = Date.now()
  const kst = new Date(now + 9 * 60 * 60 * 1000)
  return Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), kst.getUTCDate()) - 9 * 60 * 60 * 1000
}

// ─── 급상승 + 변화 감지 집계 (91 computeTrendingTopics 방식, KST 주 경계) ────

export function computeIssueActivity(
  issues: IssueRow[],
  activityRows: ActivityRow[],
): IssueCard[] {
  const todayStartMs = getKstTodayStartMs()
  const thisWeekStart = todayStartMs - 6 * 24 * 60 * 60 * 1000
  const prevWeekStart = todayStartMs - 13 * 24 * 60 * 60 * 1000

  const curMap:     Record<string, number> = {}
  const prevMap:    Record<string, number> = {}
  const posMap:     Record<string, number> = {}
  const negMap:     Record<string, number> = {}
  const totalMap:   Record<string, number> = {}
  const curNegMap:  Record<string, number> = {}  // 이번 주 부정
  const prevNegMap: Record<string, number> = {}  // 직전 주 부정
  const kwFreqMap:  Record<string, Map<string, number>> = {}  // 172 추가 — 이슈별 키워드 빈도

  for (const row of activityRows) {
    if (!row.contents) continue
    const kstMs = new Date(row.contents.collected_at).getTime() + 9 * 60 * 60 * 1000
    const isThisWeek = kstMs >= thisWeekStart + 9 * 60 * 60 * 1000
    const isPrevWeek = !isThisWeek && kstMs >= prevWeekStart + 9 * 60 * 60 * 1000
    const id = row.issue_id

    totalMap[id] = (totalMap[id] ?? 0) + 1
    if (isThisWeek) curMap[id]  = (curMap[id]  ?? 0) + 1
    if (isPrevWeek) prevMap[id] = (prevMap[id] ?? 0) + 1
    if (row.contents.sentiment === '긍정') posMap[id] = (posMap[id] ?? 0) + 1
    if (row.contents.sentiment === '부정') negMap[id] = (negMap[id] ?? 0) + 1
    if (isThisWeek && row.contents.sentiment === '부정') curNegMap[id]  = (curNegMap[id]  ?? 0) + 1
    if (isPrevWeek && row.contents.sentiment === '부정') prevNegMap[id] = (prevNegMap[id] ?? 0) + 1

    if (row.contents.matched_keywords?.length) {
      if (!kwFreqMap[id]) kwFreqMap[id] = new Map()
      const freq = kwFreqMap[id]
      for (const kw of row.contents.matched_keywords) {
        freq.set(kw, (freq.get(kw) ?? 0) + 1)
      }
    }
  }

  const cards: IssueCard[] = issues.map(issue => {
    const cur     = curMap[issue.id]  ?? 0
    const prev    = prevMap[issue.id] ?? 0
    const changePct = prev > 0 ? Math.round((cur - prev) / prev * 100) : (cur > 0 ? null : 0)

    const recentNeg = curNegMap[issue.id]  ?? 0
    const prevNeg   = prevNegMap[issue.id] ?? 0
    const recentNegRatio = cur  > 0 ? recentNeg / cur  : 0
    const prevNegRatio   = prev > 0 ? prevNeg   / prev : 0
    const sentimentWorsening = recentNeg >= 3 && (recentNegRatio - prevNegRatio) >= 0.15

    const isSurge = cur > 0 && (changePct === null || changePct > 30)
    const changeFlag: IssueCard['changeFlag'] =
      sentimentWorsening ? 'worsening' : isSurge ? 'surge' : null

    const topKeywords = [...(kwFreqMap[issue.id]?.entries() ?? [])]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map(([kw]) => kw)

    return {
      id: issue.id,
      title: issue.title,
      summary: issue.summary,
      recentCount: cur,
      prevCount: prev,
      changePct,
      sentimentPos: posMap[issue.id] ?? 0,
      sentimentNeg: negMap[issue.id] ?? 0,
      total: totalMap[issue.id] ?? 0,
      prevNeg,
      sentimentWorsening,
      changeFlag,
      topKeywords,
    }
  })

  return cards.sort((a, b) => {
    const aScore = a.changePct === null ? Infinity : a.changePct
    const bScore = b.changePct === null ? Infinity : b.changePct
    if (bScore !== aScore) return bScore - aScore
    return b.recentCount - a.recentCount
  })
}

// ─── 페치 헬퍼 ─────────────────────────────────────────────────────────────

export async function fetchIssueActivity(supabase: SupabaseClient): Promise<IssueCard[]> {
  const { data: issuesData } = await supabase
    .from('issues')
    .select('id, title, summary')
    .eq('status', 'published')
    .order('created_at', { ascending: false })

  const issues = (issuesData ?? []) as IssueRow[]
  const issueIds = issues.map(i => i.id)

  let activityRows: ActivityRow[] = []
  if (issueIds.length > 0) {
    const { data: actData } = await supabase
      .from('issue_contents')
      .select('issue_id, contents!inner(collected_at, sentiment, matched_keywords)')
      .in('issue_id', issueIds)
      .limit(5000)
    activityRows = (actData ?? []) as unknown as ActivityRow[]
  }

  return computeIssueActivity(issues, activityRows)
}
