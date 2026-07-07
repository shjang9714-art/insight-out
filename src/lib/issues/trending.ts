import 'server-only'

import { createClient } from '@supabase/supabase-js'
import { unstable_cache } from 'next/cache'

/**
 * 쿠키 비의존 anon 클라이언트 — unstable_cache로 요청 간 캐시하려면 특정 사용자
 * 세션에 묶이면 안 된다. trending_keywords·trending_issue_articles 뷰가 anon에
 * GRANT되어 있어(§1-3·§5) 이 클라이언트로 충분(기반 테이블 RLS는 뷰가 우회).
 */
function createPublicClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  )
}

// ─── 상수 (§5-4, 튜닝 시 이 블록만 수정) ─────────────────────────────────────
// 실측(2026-07-08): 48h 창 기준 26개 이슈가 임계 2건 이상 확보(trending_keywords 뷰).

export const TRENDING_LIMIT = 8
// 48h 창·임계 2건은 trending_keywords/trending_issue_articles 뷰(SQL)에 고정 — 여기선 미사용.
const SUBCLUSTER_SIM = 0.35
const MIN_SUBCLUSTER = 2
const SURGE_CHANGE_PCT_THRESHOLD = 30
const CACHE_REVALIDATE_SECONDS = 20 * 60 // 20분 — 크롤 주기(1일 1회) 대비 매 요청 재계산 방지

// ─── 타입 ────────────────────────────────────────────────────────────────────

interface TrendingIssueRow {
  issue_id: string
  title: string
  recent_count: number
  prev_count: number
}

interface EntityRef {
  name: string
  concrete: boolean // company·product·person만 true — tech·industry·policy는 너무 범용(예: "AI")
}

interface ArticleRow {
  title: string
  normTitle: string
  collectedAt: string
  entities: EntityRef[]
}

export interface TrendingEvent {
  issueId: string
  headline: string
  entityChip: string | null
  recentCount: number
  changePct: number | null
  changeFlag: 'surge' | null
}

const CONCRETE_ENTITY_TYPES = new Set(['company', 'product', 'person'])

// ─── 제목 정규화 (§5-2 step2) ────────────────────────────────────────────────

function normalizeTitle(title: string): string {
  return title
    .replace(/^\[[^\]]*\]\s*/, '')            // 선행 대괄호(칼럼명·[단독]·[속보] 등)
    .replace(/\s*[-–]\s*[^\s-–]{2,20}$/, '')  // 말미 " - 매체명"
    .replace(/\s+/g, ' ')
    .trim()
}

// ─── 문자 bigram Jaccard 유사도 ──────────────────────────────────────────────

function bigrams(s: string): Set<string> {
  const chars = s.replace(/\s+/g, '')
  const set = new Set<string>()
  for (let i = 0; i < chars.length - 1; i++) set.add(chars.slice(i, i + 2))
  return set
}

function similarity(a: string, b: string): number {
  const A = bigrams(a)
  const B = bigrams(b)
  if (A.size === 0 || B.size === 0) return 0
  let inter = 0
  for (const g of A) if (B.has(g)) inter++
  return inter / (A.size + B.size - inter)
}

// ─── Union-Find (이슈 내부 48h 기사 서브클러스터링) ───────────────────────────

class UnionFind {
  private parent: number[]
  constructor(n: number) {
    this.parent = Array.from({ length: n }, (_, i) => i)
  }
  find(x: number): number {
    while (this.parent[x] !== x) {
      this.parent[x] = this.parent[this.parent[x]]
      x = this.parent[x]
    }
    return x
  }
  union(a: number, b: number) {
    const ra = this.find(a)
    const rb = this.find(b)
    if (ra !== rb) this.parent[ra] = rb
  }
}

function dominantEntity(articles: ArticleRow[]): string | null {
  const freq = new Map<string, number>()
  for (const a of articles) {
    for (const e of a.entities) {
      if (!e.concrete) continue
      freq.set(e.name, (freq.get(e.name) ?? 0) + 1)
    }
  }
  let best: string | null = null
  let bestCount = 0
  for (const [name, count] of freq) {
    if (count > bestCount) { best = name; bestCount = count }
  }
  return best
}

/** 이슈 하나의 48h 기사들을 제목 유사도·핵심 엔티티 공유 기준으로 서브클러스터링. */
function subclusterIssue(articles: ArticleRow[]): { headline: string; entityChip: string | null; count: number }[] {
  const uf = new UnionFind(articles.length)
  for (let i = 0; i < articles.length; i++) {
    for (let j = i + 1; j < articles.length; j++) {
      const sim = similarity(articles[i].normTitle, articles[j].normTitle)
      const sharedEntity = articles[i].entities.some(
        e => e.concrete && articles[j].entities.some(e2 => e2.concrete && e2.name === e.name)
      )
      if (sim >= SUBCLUSTER_SIM || sharedEntity) uf.union(i, j)
    }
  }

  const groups = new Map<number, ArticleRow[]>()
  articles.forEach((a, i) => {
    const root = uf.find(i)
    if (!groups.has(root)) groups.set(root, [])
    groups.get(root)!.push(a)
  })

  const qualified = [...groups.values()].filter(g => g.length >= MIN_SUBCLUSTER)

  // degrade: 묶이는 그룹이 하나도 없으면(전부 단발) 이슈 전체를 대표 헤드라인 1개로.
  if (qualified.length === 0) {
    const latest = [...articles].sort((a, b) => b.collectedAt.localeCompare(a.collectedAt))[0]
    if (!latest) return []
    return [{ headline: latest.title, entityChip: dominantEntity(articles), count: articles.length }]
  }

  return qualified.map(group => {
    const representative = [...group].sort((a, b) => a.title.length - b.title.length)[0]
    return { headline: representative.title, entityChip: dominantEntity(group), count: group.length }
  })
}

// ─── 이슈 간 중복 억제 (§5-2 step7, 옵션) ────────────────────────────────────

function dedupeAcrossIssues(events: TrendingEvent[]): TrendingEvent[] {
  const kept: TrendingEvent[] = []
  for (const ev of events) {
    const isDup = kept.some(k =>
      k.entityChip !== null &&
      k.entityChip === ev.entityChip &&
      similarity(normalizeTitle(k.headline), normalizeTitle(ev.headline)) >= SUBCLUSTER_SIM
    )
    if (!isDup) kept.push(ev)
  }
  return kept
}

// ─── 메인 계산 (unstable_cache로 래핑) ────────────────────────────────────────

interface IssueArticleRow {
  issue_id: string
  content_id: string
  title: string
  collected_at: string
  entity_name: string | null
  entity_type: string | null
}

async function computeTrendingEvents(): Promise<TrendingEvent[] | null> {
  const supabase = createPublicClient()

  const { data: candidateData, error: viewErr } = await supabase
    .from('trending_keywords')
    .select('issue_id, title, recent_count, prev_count')

  if (viewErr) return null
  const candidates = (candidateData ?? []) as TrendingIssueRow[]
  if (candidates.length === 0) return []

  const issueIds = candidates.map(c => c.issue_id)

  // trending_issue_articles 뷰는 이미 status='published' & 48h 창으로 필터링됨(§5 SQL).
  const { data: rows, error: rowsErr } = await supabase
    .from('trending_issue_articles')
    .select('issue_id, content_id, title, collected_at, entity_name, entity_type')
    .in('issue_id', issueIds)
    .limit(5000)

  if (rowsErr || !rows) return null

  // (issue_id, content_id, entity) 그레인 → 이슈별 기사 단위로 엔티티 fan-in.
  const byIssue = new Map<string, Map<string, ArticleRow & { contentId: string }>>()
  for (const row of rows as IssueArticleRow[]) {
    if (!byIssue.has(row.issue_id)) byIssue.set(row.issue_id, new Map())
    const articles = byIssue.get(row.issue_id)!

    if (!articles.has(row.content_id)) {
      articles.set(row.content_id, {
        contentId: row.content_id,
        title: row.title,
        normTitle: normalizeTitle(row.title),
        collectedAt: row.collected_at,
        entities: [],
      })
    }
    if (row.entity_name && row.entity_type) {
      articles.get(row.content_id)!.entities.push({
        name: row.entity_name,
        concrete: CONCRETE_ENTITY_TYPES.has(row.entity_type),
      })
    }
  }

  const events: TrendingEvent[] = []
  for (const issue of candidates) {
    const articles = [...(byIssue.get(issue.issue_id)?.values() ?? [])]
    if (articles.length === 0) continue

    const changePct = issue.prev_count > 0
      ? Math.round((issue.recent_count - issue.prev_count) / issue.prev_count * 100)
      : (issue.recent_count > 0 ? null : 0)
    const isSurge = issue.recent_count > 0 && (changePct === null || changePct > SURGE_CHANGE_PCT_THRESHOLD)

    for (const sc of subclusterIssue(articles)) {
      events.push({
        issueId: issue.issue_id,
        headline: sc.headline,
        entityChip: sc.entityChip,
        recentCount: sc.count,
        changePct,
        changeFlag: isSurge ? 'surge' : null,
      })
    }
  }

  const ranked = events.sort((a, b) => {
    if (b.recentCount !== a.recentCount) return b.recentCount - a.recentCount
    const aScore = a.changePct === null ? Infinity : a.changePct
    const bScore = b.changePct === null ? Infinity : b.changePct
    return bScore - aScore
  })

  return dedupeAcrossIssues(ranked).slice(0, TRENDING_LIMIT)
}

/**
 * 홈 "실시간 급상승 키워드" — `trending_keywords` 뷰(48h 발행건수 후보) 위에
 * 이슈 내부 서브이벤트 클러스터링(§5)을 얹어 특정 사건 단위로 반환.
 * 뷰가 아직 적용되지 않았으면(42P01/PGRST205 등 조회 실패) null — 호출부에서 폴백 처리.
 * 20분 단위로 캐시(크롤 주기 대비 매 요청 재계산 방지).
 */
export const fetchTrendingEvents = unstable_cache(
  computeTrendingEvents,
  ['trending-events-v1'],
  { revalidate: CACHE_REVALIDATE_SECONDS },
)
