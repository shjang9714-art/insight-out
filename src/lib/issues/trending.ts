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

// ─── 상수 (튜닝 시 이 블록만 수정) ────────────────────────────────────────────
// 72h 창·임계 2건은 trending_keywords/trending_issue_articles 뷰(SQL)에 고정 — 여기선 미사용.

export const TRENDING_LIMIT = 12
const MIN_DISPLAY = 10 // 특정 사건이 모자라면 이 개수까지 degrade(이슈 전체) 항목으로 backfill
const SUBCLUSTER_SIM = 0.35 // 이슈 내부 서브클러스터링(느슨 — 같은 사건 다매체 픽업 흡수용)
const DEDUP_SIM = 0.5 // 이슈 간 동일 엔티티 + 헤드라인 유사 시 병합(느슨한 SUBCLUSTER_SIM보다 엄격)
const IDENTICAL_SIM = 0.6 // 엔티티 무관, 사실상 같은 헤드라인이면 무조건 병합(교차 태깅된 동일 기사 중복 방지)
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
  contentId: string
  title: string
  normTitle: string
  collectedAt: string
  entities: EntityRef[]
}

export interface TrendingEvent {
  issueId: string
  /** 대표 기사(헤드라인 근거) content_id — 칩 클릭 시 기사 상세로 바로 연결하는 데 사용 */
  contentId: string
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

interface SubclusterResult { headline: string; contentId: string; entityChip: string | null; count: number }

/** 이슈 하나의 48h 기사들을 제목 유사도·핵심 엔티티 공유 기준으로 서브클러스터링(실제로 묶인 size≥2 사건만). */
function subclusterIssue(articles: ArticleRow[]): SubclusterResult[] {
  if (articles.length === 0) return []

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

  return [...groups.values()]
    .filter(g => g.length >= MIN_SUBCLUSTER)
    .map(group => {
      const representative = [...group].sort((a, b) => a.title.length - b.title.length)[0]
      return {
        headline: representative.title,
        contentId: representative.contentId,
        entityChip: dominantEntity(group),
        count: group.length,
      }
    })
}

// ─── 이슈 간 중복 억제 ────────────────────────────────────────────────────────
// 헤드라인이 사실상 동일하면(IDENTICAL_SIM) 엔티티 유무와 무관하게 병합 — 같은 기사가
// 여러 이슈에 교차 태깅되어 동일 헤드라인이 반복 노출되는 걸 막는다(실측으로 확인된 케이스).
// 그 외엔 "동일 엔티티 AND 헤드라인 유사도 높음(DEDUP_SIM)" 둘 다 만족해야 병합 —
// 지배 엔티티만 같다고 병합하면 같은 회사의 서로 다른 사건이 뭉개진다.

function isDuplicateEvent(a: TrendingEvent, b: TrendingEvent): boolean {
  const sim = similarity(normalizeTitle(a.headline), normalizeTitle(b.headline))
  if (sim >= IDENTICAL_SIM) return true
  return a.entityChip !== null && a.entityChip === b.entityChip && sim >= DEDUP_SIM
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
  const byIssue = new Map<string, Map<string, ArticleRow>>()
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

  const specificEvents: TrendingEvent[] = []
  // 이슈별 changePct/changeFlag — backfill 단계에서 재사용(중복 계산 방지).
  const issueChange = new Map<string, { changePct: number | null; changeFlag: 'surge' | null }>()

  for (const issue of candidates) {
    const articles = [...(byIssue.get(issue.issue_id)?.values() ?? [])]
    if (articles.length === 0) continue

    const changePct = issue.prev_count > 0
      ? Math.round((issue.recent_count - issue.prev_count) / issue.prev_count * 100)
      : (issue.recent_count > 0 ? null : 0)
    const isSurge = issue.recent_count > 0 && (changePct === null || changePct > SURGE_CHANGE_PCT_THRESHOLD)
    const changeFlag = isSurge ? 'surge' as const : null
    issueChange.set(issue.issue_id, { changePct, changeFlag })

    for (const sc of subclusterIssue(articles)) {
      specificEvents.push({
        issueId: issue.issue_id,
        contentId: sc.contentId,
        headline: sc.headline,
        entityChip: sc.entityChip,
        recentCount: sc.count,
        changePct,
        changeFlag,
      })
    }
  }

  specificEvents.sort((a, b) => {
    if (b.recentCount !== a.recentCount) return b.recentCount - a.recentCount
    const aScore = a.changePct === null ? Infinity : a.changePct
    const bScore = b.changePct === null ? Infinity : b.changePct
    return bScore - aScore
  })

  const primary: TrendingEvent[] = []
  for (const ev of specificEvents) {
    if (!primary.some(k => isDuplicateEvent(k, ev))) primary.push(ev)
  }

  const final = primary.slice(0, TRENDING_LIMIT)

  // 최소 노출 개수 미달 시 이슈 전체 대표 헤드라인으로 backfill. content_id·정규화 헤드라인
  // 기준으로 전역 distinct 보장 — 같은 기사가 여러 이슈에 교차 태깅돼도 최종 리스트엔 1번만.
  // 한 이슈의 최신 기사가 이미 쓰였으면 그 이슈의 다음 최신 기사로, 그래도 없으면 다음 이슈로.
  if (final.length < MIN_DISPLAY) {
    const usedIssueIds = new Set(final.map(f => f.issueId))
    const usedContentIds = new Set<string>()
    const usedHeadlines = new Set(final.map(f => normalizeTitle(f.headline)))

    const backfillIssues = candidates
      .filter(c => !usedIssueIds.has(c.issue_id))
      .sort((a, b) => b.recent_count - a.recent_count)

    for (const issue of backfillIssues) {
      if (final.length >= MIN_DISPLAY) break

      const articles = [...(byIssue.get(issue.issue_id)?.values() ?? [])]
        .sort((a, b) => b.collectedAt.localeCompare(a.collectedAt))

      for (const article of articles) {
        if (usedContentIds.has(article.contentId) || usedHeadlines.has(article.normTitle)) continue

        const change = issueChange.get(issue.issue_id) ?? { changePct: null, changeFlag: null }
        final.push({
          issueId: issue.issue_id,
          contentId: article.contentId,
          headline: article.title,
          entityChip: dominantEntity([article]),
          recentCount: issue.recent_count, // 이슈 전체 48h 건수(단일 기사 건수 아님) — degrade는 "이슈 대표" 의미
          changePct: change.changePct,
          changeFlag: change.changeFlag,
        })
        usedContentIds.add(article.contentId)
        usedHeadlines.add(article.normTitle)
        break // 이슈당 backfill 항목 최대 1개
      }
    }
  }

  return final
}

/**
 * 홈 "실시간 급상승 키워드" — `trending_keywords` 뷰(72h 발행건수 후보) 위에
 * 이슈 내부 서브이벤트 클러스터링(§5)을 얹어 특정 사건 단위로 반환.
 * 특정 사건이 MIN_DISPLAY 미만이면 degrade(이슈 전체) 항목으로 backfill.
 * 뷰가 아직 적용되지 않았으면(42P01/PGRST205 등 조회 실패) null — 호출부에서 폴백 처리.
 * 20분 단위로 캐시(크롤 주기 대비 매 요청 재계산 방지).
 */
export const fetchTrendingEvents = unstable_cache(
  computeTrendingEvents,
  ['trending-events-v1'],
  { revalidate: CACHE_REVALIDATE_SECONDS },
)
