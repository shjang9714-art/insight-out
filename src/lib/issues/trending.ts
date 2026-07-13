import 'server-only'

import { createClient } from '@supabase/supabase-js'
import { unstable_cache } from 'next/cache'
import { getKstDateString, getKstDayStartIso } from '@/lib/date'

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
const MIN_DISPLAY = 10 // 특정 사건이 모자라면 이 개수까지 degrade(이슈 전체) 항목으로 backfill — 단, 오늘 기사가 있는 이슈로만 채움(§오늘자 게이트). 모자라면 목표치 미달인 채 그대로 반환(오늘 0건 이슈로 패딩 금지).
const SUBCLUSTER_SIM = 0.35 // 이슈 내부 서브클러스터링(느슨 — 같은 사건 다매체 픽업 흡수용)
const DEDUP_SIM = 0.5 // 이슈 간 동일 엔티티 + 헤드라인 유사 시 병합(느슨한 SUBCLUSTER_SIM보다 엄격)
const IDENTICAL_SIM = 0.6 // 엔티티 무관, 사실상 같은 헤드라인이면 무조건 병합(교차 태깅된 동일 기사 중복 방지)
// 헤드라인 핵심어(단어 단위) 겹침 임계 — "같은 회사로 확인된 두 이벤트"에만 적용하는 병합
// 트리거(§2 재설계, 2026-07-13). 최초 시도(이슈 전체 오늘자 기사집합 Jaccard)는 서로 다른
// 회사(SK하이닉스 vs 삼성전자)의 이슈끼리도 기사 풀이 겹쳐(실측 jaccard=1.00) 오병합을
// 일으켜 폐기 — 회사명 게이트로 먼저 걸러낸 뒤에만 이 임계를 본다.
// 실측 튜닝(2026-07-13, 오늘자 데이터): 삼성 용인 반도체 3건 겹침 0.23~0.42, SK하이닉스
// 나스닥 데뷔 2건(5·10위류) 겹침 0.21인 반면, 그 외 진짜 다른 SK하이닉스 사건들(환율·
// 40조 조달·반도체 열전 칼럼 등)의 최대 겹침은 0.15 — 그 사이(0.16~0.21)에서 0.2 채택.
const HEADLINE_KEYWORD_OVERLAP_SIM = 0.2
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
  matchedKeywords: string[]
}

export interface TrendingEventsResult {
  events: TrendingEvent[]
  /** 기준일 KST 날짜('YYYY-MM-DD'). 이제 항상 KST 캘린더 오늘 — 순위·건수 모두 당일 수집분만
   *  사용하므로 라벨·날짜 선택기와 항상 일치한다(2026-07-13 결정, 구 floating 방식 폐기). */
  asOfDateKst: string
}

export interface TrendingEvent {
  issueId: string
  /** 대표 기사(헤드라인 근거) content_id — 칩 클릭 시 기사 상세로 바로 연결하는 데 사용 */
  contentId: string
  headline: string
  entityChip: string | null
  /** 대표 기사의 matched_keywords 중 첫 번째(관련도 점수 컬럼이 없어 매칭 순서로 대체) */
  topHashtag: string | null
  recentCount: number
  /** KST 오늘(자정~현재) 발행 건수 */
  todayCount: number
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

// ─── 헤드라인 회사명 게이트 (§2 재설계) ───────────────────────────────────────
// 이슈 간 병합 시 "서로 다른 구체 회사면 무조건 금지"를 헤드라인 텍스트만으로 판정.
// content_entities 기반 entityChip은 이 데이터셋에서 대부분 null이라(실측) 못 믿는다.
// 현 프로젝트 관련사(LGU+·경쟁 통신3사) + 주요 빅테크·대기업 위주, 확장은 이 사전만 수정.
const COMPANY_ALIASES: Record<string, string> = {
  '삼성전자': '삼성전자',
  '삼성': '삼성전자',
  'SK하이닉스': 'SK하이닉스',
  '하이닉스': 'SK하이닉스',
  'SK텔레콤': 'SK텔레콤',
  'SKT': 'SK텔레콤',
  'KT': 'KT',
  'LG유플러스': 'LG유플러스',
  'LGU+': 'LG유플러스',
  '유플러스': 'LG유플러스',
  'LG전자': 'LG전자',
  'SK브로드밴드': 'SK브로드밴드',
  '네이버': '네이버',
  '카카오': '카카오',
  '현대차': '현대차',
  '현대자동차': '현대차',
}
// 별칭이 서로의 부분 문자열일 수 있어(예: "삼성전자" ⊃ "삼성") 긴 별칭부터 매칭해야
// "삼성전자" 기사가 "삼성"으로도 중복 카운트되어 index만 흐트러지는 걸 방지.
const COMPANY_ALIAS_ENTRIES = Object.entries(COMPANY_ALIASES).sort((a, b) => b[0].length - a[0].length)

/** 헤드라인에서 사전에 매칭되는 회사 중 최다 등장(동률 시 최선두 등장) 1곳을 "지배 회사"로 추출. */
function extractDominantCompany(headline: string): string | null {
  const hits = new Map<string, { count: number; firstIndex: number }>()
  for (const [alias, canonical] of COMPANY_ALIAS_ENTRIES) {
    const idx = headline.indexOf(alias)
    if (idx === -1) continue
    const existing = hits.get(canonical)
    if (existing) {
      existing.count += 1
      existing.firstIndex = Math.min(existing.firstIndex, idx)
    } else {
      hits.set(canonical, { count: 1, firstIndex: idx })
    }
  }
  if (hits.size === 0) return null
  return [...hits.entries()].sort(
    (a, b) => b[1].count - a[1].count || a[1].firstIndex - b[1].firstIndex
  )[0][0]
}

// ─── 헤드라인 핵심어(단어 단위) Jaccard 겹침 ─────────────────────────────────
// 문자 bigram(similarity)과 달리 단어 단위 — "용인·반도체·2029년·앞당" 같은 핵심 명사가
// 여러 헤드라인 변형에 걸쳐 얼마나 겹치는지로 같은 사건 여부를 판정(§2 재설계 병합 트리거).

function keywordTokens(title: string): Set<string> {
  const norm = normalizeTitle(title)
  const cleaned = norm.replace(/[[\]"'"…·,.\-–()~%!?~"'‘’“”『』/]/g, ' ')
  const tokens = cleaned.split(/\s+/).filter(t => t.length >= 2)
  return new Set(tokens)
}

function keywordOverlap(a: string, b: string): number {
  const A = keywordTokens(a)
  const B = keywordTokens(b)
  if (A.size === 0 || B.size === 0) return 0
  let inter = 0
  for (const t of A) if (B.has(t)) inter++
  const union = A.size + B.size - inter
  return union === 0 ? 0 : inter / union
}

// ─── Union-Find (이슈 내부 72h 기사 서브클러스터링) ───────────────────────────

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

interface SubclusterResult {
  headline: string
  contentId: string
  entityChip: string | null
  topHashtag: string | null
  count: number
  todayCount: number
}

/** 이슈 하나의 72h 기사들을 제목 유사도·핵심 엔티티 공유 기준으로 서브클러스터링(실제로 묶인 size≥2 사건만). */
function subclusterIssue(articles: ArticleRow[], kstBasisDayStartIso: string): SubclusterResult[] {
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
      // 대표 기사 = collectedAt 최신순 1건(오늘 기사가 있으면 오늘 날짜가 어제보다 항상 뒤라
      // 자연히 우선 채택됨). 과거엔 title.length asc(제목 짧은 순)였는데 날짜와 무관해
      // 그룹 내 가장 짧은 제목이 며칠 전 기사여도 대표로 뽑히는 버그였다(실측, 2026-07-12:
      // "KT알파" 10위 항목 대표기사가 7/12 랭킹인데 7/10자 기사로 노출).
      const representative = [...group].sort((a, b) => b.collectedAt.localeCompare(a.collectedAt))[0]
      return {
        headline: representative.title,
        contentId: representative.contentId,
        entityChip: dominantEntity(group),
        topHashtag: representative.matchedKeywords[0] ?? null,
        count: group.length,
        todayCount: group.filter(a => a.collectedAt >= kstBasisDayStartIso).length,
      }
    })
}

// ─── 이슈 간 중복 억제 ────────────────────────────────────────────────────────
// 헤드라인이 사실상 동일하면(IDENTICAL_SIM) 엔티티 유무와 무관하게 병합 — 같은 기사가
// 여러 이슈에 교차 태깅되어 동일 헤드라인이 반복 노출되는 걸 막는다(실측으로 확인된 케이스).
// 그 외엔 "동일 엔티티 AND 헤드라인 유사도 높음(DEDUP_SIM)" 둘 다 만족해야 병합 —
// 지배 엔티티만 같다고 병합하면 같은 회사의 서로 다른 사건이 뭉개진다.

/**
 * §2 재설계: 이슈 오늘자 기사집합 Jaccard(최초 시도)는 서로 다른 회사(SK하이닉스 vs
 * 삼성전자)의 이슈끼리도 "반도체" 같은 넓은 도메인 아래 기사 풀이 실측상 완전히
 * 겹쳐(jaccard=1.00) 오병합을 일으켜 폐기. 대신 헤드라인 텍스트에서 회사명을 직접
 * 추출해 "서로 다른 구체 회사면 무조건 병합 금지" 게이트를 먼저 걸고, 같은 회사로
 * 확인된 쌍에 한해서만 헤드라인 핵심어 겹침을 병합 트리거로 쓴다. 회사가 하나라도
 * 미인식이면 새 신호는 적용하지 않고 기존 헤드라인 유사도/entityChip 로직만 따른다.
 */
function isDuplicateEvent(a: TrendingEvent, b: TrendingEvent): boolean {
  const sim = similarity(normalizeTitle(a.headline), normalizeTitle(b.headline))
  if (sim >= IDENTICAL_SIM) return true
  if (a.entityChip !== null && a.entityChip === b.entityChip && sim >= DEDUP_SIM) return true

  if (a.issueId === b.issueId) return false

  const companyA = extractDominantCompany(a.headline)
  const companyB = extractDominantCompany(b.headline)

  // 과병합 방지 핵심 게이트: 서로 다른 구체 회사가 헤드라인에서 각각 검출되면
  // 핵심어 겹침이 아무리 높아도 병합 금지(예: 삼성전자 vs SK하이닉스).
  if (companyA !== null && companyB !== null && companyA !== companyB) return false

  // 새 신호는 "같은 회사로 확인된 쌍"에만 적용 — 회사 미인식 조합은 핵심어 겹침
  // 단독으로 병합시키지 않는다(위 기존 헤드라인 유사도 로직만으로 판단).
  if (companyA === null || companyB === null) return false

  return keywordOverlap(a.headline, b.headline) >= HEADLINE_KEYWORD_OVERLAP_SIM
}

/**
 * 최종 리스트(primary + degrade backfill) 전체에 대해 한 번 더 near-dup 붕괴 패스를 돈다.
 * primary 단계의 isDuplicateEvent 억제는 backfill 항목(§main final.push 구간)엔 적용되지
 * 않아, 같은 사건이 여러 이슈로 쪼개진 채 backfill로 각각 노출되는 문제가 있었다(§2).
 * 같은 사건으로 판정되면 recentCount가 더 높은 쪽만 남긴다.
 */
function collapseDuplicateEvents(events: TrendingEvent[]): TrendingEvent[] {
  const kept: TrendingEvent[] = []
  for (const ev of events) {
    const dupIndex = kept.findIndex(k => isDuplicateEvent(k, ev))
    if (dupIndex === -1) {
      kept.push(ev)
    } else if (compareByRecentCountDesc(ev, kept[dupIndex]) < 0) {
      kept[dupIndex] = ev
    }
  }
  return kept
}

/** recentCount 내림차순, 동률 시 changePct 내림차순(null은 최우선) — 특정사건·degrade 항목 통합 정렬에 공용. */
function compareByRecentCountDesc(a: TrendingEvent, b: TrendingEvent): number {
  if (b.recentCount !== a.recentCount) return b.recentCount - a.recentCount
  const aScore = a.changePct === null ? Infinity : a.changePct
  const bScore = b.changePct === null ? Infinity : b.changePct
  return bScore - aScore
}

// ─── 메인 계산 (unstable_cache로 래핑) ────────────────────────────────────────

interface IssueArticleRow {
  issue_id: string
  content_id: string
  title: string
  collected_at: string
  entity_name: string | null
  entity_type: string | null
  matched_keywords: string[] | null
}

const ISSUE_ARTICLES_PAGE_SIZE = 1000 // Supabase/PostgREST 기본 max-rows — 단일 .limit()로 이 이상 요청해도 서버가 조용히 잘라서 반환
const ISSUE_ARTICLES_MAX_PAGES = 10 // 안전장치: 최대 10 * 1000 = 10000건까지만 페이지네이션(무한루프 방지)

/**
 * trending_issue_articles 뷰에서 issueIds에 매칭되는 행을 range() 페이지네이션으로 전부 가져온다.
 * 과거 단일 `.limit(5000)` 호출은 PostgREST 기본 max-rows(1000)에 조용히 잘리고 정렬 기준도
 * 없어, 이슈 후보군(31개)에 실제 매칭되는 3026건 중 1000건만 임의로(=최신순 보장 없이) 반환하던
 * 실측 버그(2026-07-12) — 같은 이슈라도 어느 기사가 이 1000건 표본에 포함되는지가 매 요청마다
 * 불안정해서 recentCount·순위·asOfDateKst가 실제 데이터 변화 없이도 흔들릴 수 있었다.
 * collected_at desc 정렬 + range()로 대체해, 잘리더라도 최소한 최신순으로 결정론적으로 잘리게 한다.
 */
async function fetchAllIssueArticles(
  supabase: ReturnType<typeof createPublicClient>,
  issueIds: string[],
): Promise<{ rows: IssueArticleRow[]; error: boolean }> {
  const rows: IssueArticleRow[] = []

  for (let page = 0; page < ISSUE_ARTICLES_MAX_PAGES; page++) {
    const from = page * ISSUE_ARTICLES_PAGE_SIZE
    const to = from + ISSUE_ARTICLES_PAGE_SIZE - 1

    const { data, error } = await supabase
      .from('trending_issue_articles')
      .select('issue_id, content_id, title, collected_at, entity_name, entity_type, matched_keywords')
      .in('issue_id', issueIds)
      .order('collected_at', { ascending: false })
      .range(from, to)

    if (error || !data) return { rows, error: true }
    rows.push(...(data as IssueArticleRow[]))

    if (data.length < ISSUE_ARTICLES_PAGE_SIZE) return { rows, error: false }

    if (page === ISSUE_ARTICLES_MAX_PAGES - 1) {
      console.warn(
        `[trending] issue_articles 페이지네이션 안전장치 도달 — ${ISSUE_ARTICLES_MAX_PAGES * ISSUE_ARTICLES_PAGE_SIZE}건 초과 가능성, 이후 데이터는 누락된 채로 계산됨`,
      )
    }
  }

  return { rows, error: false }
}

async function computeTrendingEvents(): Promise<TrendingEventsResult | null> {
  const supabase = createPublicClient()

  const { data: candidateData, error: viewErr } = await supabase
    .from('trending_keywords')
    .select('issue_id, title, recent_count, prev_count')

  if (viewErr) return null
  const candidates = (candidateData ?? []) as TrendingIssueRow[]
  if (candidates.length === 0) return { events: [], asOfDateKst: getKstDateString() }

  const issueIds = candidates.map(c => c.issue_id)

  // trending_issue_articles 뷰는 이미 status='published' & 72h 창으로 필터링됨(2026-07-08c/10 SQL).
  const { rows, error: rowsErr } = await fetchAllIssueArticles(supabase, issueIds)

  if (rowsErr) return null

  // "오늘의 급상승"은 KST 캘린더 당일만 대상으로 한다(사용자 결정 2026-07-13).
  // 과거엔 랭킹에 반영된 기사들의 최신 발행일(asOfDateKst, 떠다니는 기준)을 썼지만,
  // 그 방식은 (a) 당일 크론 전 새벽엔 어제 날짜로 라벨이 뜨고 (b) 날짜 선택기(오늘)와
  // 헤더 라벨(어제)이 어긋나며 (c) 72h 윈도우로 이전 일자 기사가 순위에 섞이는 문제가 있었다.
  // 이제 기준일을 KST 오늘로 고정하고, 순위·건수·대표기사 모두 오늘 수집분만 사용한다.
  // 오늘 기사가 아직 없으면(크론 전) events는 빈 배열로 반환돼 "최근 급상승 이슈가 없습니다."가 뜬다.
  const todayKst = getKstDateString()

  // (issue_id, content_id, entity) 그레인 → 이슈별 기사 단위로 엔티티 fan-in.
  // content_entities left join으로 한 기사에 엔티티가 여러 개면 뷰에서 같은 content_id가
  // 행으로 중복 fan-out된다(실측 확인, 2026-07-12). Map을 issue_id→content_id로 이중 키잉해
  // 이미 존재하는 content_id는 재생성 없이 entities 배열에만 추가하므로, 이후 subclusterIssue의
  // count·todayCount 계산은 항상 distinct 기사 수 기준 — 별도 dedupe 불필요.
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
        matchedKeywords: row.matched_keywords ?? [],
      })
    }
    if (row.entity_name && row.entity_type) {
      articles.get(row.content_id)!.entities.push({
        name: row.entity_name,
        concrete: CONCRETE_ENTITY_TYPES.has(row.entity_type),
      })
    }
  }

  const kstBasisDayStartIso = getKstDayStartIso(todayKst)

  const specificEvents: TrendingEvent[] = []
  // 이슈별 changePct/changeFlag/오늘 건수 — backfill 단계에서 재사용(중복 계산 방지).
  const issueChange = new Map<string, { changePct: number | null; changeFlag: 'surge' | null; todayCount: number }>()

  for (const issue of candidates) {
    // "오늘의 급상승"은 오늘(KST 캘린더 당일) 기사만으로 구성한다 — 클러스터링·건수·대표기사
    // 이전에 오늘자 기사만 남기고, 이후 모든 계산(subcluster size = 오늘 건수)은 당일 기준.
    // 72h 윈도우로 들어온 이전 일자 기사는 여기서 전부 제외된다(사용자 결정 2026-07-13).
    const articles = [...(byIssue.get(issue.issue_id)?.values() ?? [])]
      .filter(a => a.collectedAt >= kstBasisDayStartIso)
    const issueTodayCount = articles.length
    // 오늘 기사가 0건인 이슈는 순위 진입 자체를 막는다.
    if (issueTodayCount === 0) continue

    const changePct = issue.prev_count > 0
      ? Math.round((issue.recent_count - issue.prev_count) / issue.prev_count * 100)
      : (issue.recent_count > 0 ? null : 0)
    const isSurge = issue.recent_count > 0 && (changePct === null || changePct > SURGE_CHANGE_PCT_THRESHOLD)
    const changeFlag = isSurge ? 'surge' as const : null
    issueChange.set(issue.issue_id, { changePct, changeFlag, todayCount: issueTodayCount })

    for (const sc of subclusterIssue(articles, kstBasisDayStartIso)) {
      // 이슈 자체는 오늘 기사가 있어도, 이 특정 서브클러스터(사건)엔 오늘 기사가 없을 수
      // 있다 — 그 경우 이 사건 단위는 순위에서 제외(같은 이슈의 다른 사건·degrade로 대체).
      if (sc.todayCount === 0) continue

      specificEvents.push({
        issueId: issue.issue_id,
        contentId: sc.contentId,
        headline: sc.headline,
        entityChip: sc.entityChip,
        topHashtag: sc.topHashtag,
        recentCount: sc.count,
        todayCount: sc.todayCount,
        changePct,
        changeFlag,
      })
    }
  }

  specificEvents.sort(compareByRecentCountDesc)

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

    // issueChange엔 issueTodayCount>=1인 이슈만 들어있다(위 이슈 레벨 게이트) — degrade
    // backfill도 오늘 기사가 아예 없는 이슈로는 채우지 않는다(그게 원래 버그의 원인).
    // 정렬은 72h recent_count가 아니라 오늘 건수(todayCount) 기준 — 순위는 당일 건수만 사용.
    const backfillIssues = candidates
      .filter(c => !usedIssueIds.has(c.issue_id) && issueChange.has(c.issue_id))
      .sort((a, b) =>
        (issueChange.get(b.issue_id)!.todayCount) - (issueChange.get(a.issue_id)!.todayCount))

    for (const issue of backfillIssues) {
      if (final.length >= MIN_DISPLAY) break

      const articles = [...(byIssue.get(issue.issue_id)?.values() ?? [])]
        .filter(a => a.collectedAt >= kstBasisDayStartIso)
        .sort((a, b) => b.collectedAt.localeCompare(a.collectedAt))

      // 대표는 반드시 오늘 기사여야 한다 — 이미 다른 항목에 쓰여 소진됐으면(이 이슈의 유일한
      // 오늘 기사가 다른 특정사건에 이미 대표로 쓰인 경우 등) 오래된 기사로 대체하지 않고
      // 이 이슈는 degrade 노출에서 통째로 제외한다(제목길이 대표선정 버그와 같은 성격 재발 방지).
      const todayArticle = articles.find(
        a => a.collectedAt >= kstBasisDayStartIso
          && !usedContentIds.has(a.contentId)
          && !usedHeadlines.has(a.normTitle)
      )
      if (!todayArticle) continue

      const change = issueChange.get(issue.issue_id) ?? { changePct: null, changeFlag: null, todayCount: 0 }
      final.push({
        issueId: issue.issue_id,
        contentId: todayArticle.contentId,
        headline: todayArticle.title,
        entityChip: dominantEntity([todayArticle]),
        topHashtag: todayArticle.matchedKeywords[0] ?? null,
        recentCount: change.todayCount, // 이슈 전체 오늘 건수(단일 기사 아님) — degrade는 "이슈 대표" 의미. 순위는 당일 건수 기준이므로 recentCount에도 오늘 건수를 넣는다.
        todayCount: change.todayCount, // 이슈 전체 기사 중 오늘 발행분(단일 기사 아님) — degrade는 이슈 대표 의미
        changePct: change.changePct,
        changeFlag: change.changeFlag,
      })
      usedContentIds.add(todayArticle.contentId)
      usedHeadlines.add(todayArticle.normTitle)
    }

    // degrade 항목은 이슈 전체 recentCount를 쓰므로 특정사건보다 커질 수 있다 — 단순히 뒤에
    // 이어붙이기만 하면 "특정사건이 항상 앞"이 되어 recentCount 내림차순이 깨진다(실측 확인,
    // 2026-07-12: recentCount=2인 특정사건이 recentCount=54인 degrade 항목보다 위에 노출됨).
    // 전체를 다시 정렬해 최종 리스트가 항상 recentCount 내림차순을 유지하게 한다.
    final.sort(compareByRecentCountDesc)
  }

  // §2: primary 단계의 isDuplicateEvent 억제는 backfill(degrade) 항목엔 적용되지 않았으므로,
  // final(primary+backfill) 전체에 대해 near-dup 붕괴 패스를 한 번 더 돌린다. recentCount가
  // 더 높은 쪽만 남기고, 정렬은 compareByRecentCountDesc 유지.
  const deduped = collapseDuplicateEvents(final)
  deduped.sort(compareByRecentCountDesc)

  // asOfDateKst 필드는 하위 호환을 위해 유지하되 값은 KST 캘린더 오늘 — 라벨·선택기와 항상 일치.
  return { events: deduped, asOfDateKst: todayKst }
}

/**
 * 홈 "실시간 급상승 키워드" — `trending_keywords` 뷰(72h 발행건수 후보) 위에
 * 이슈 내부 서브이벤트 클러스터링(§5)을 얹어 특정 사건 단위로 반환.
 * 특정 사건이 MIN_DISPLAY 미만이면 degrade(이슈 전체) 항목으로 backfill.
 * 뷰가 아직 적용되지 않았으면(42P01/PGRST205 등 조회 실패) null — 호출부에서 폴백 처리.
 * `asOfDateKst`는 랭킹에 반영된 기사들의 최신 발행일 기준 — 오늘자 크론(05:00 KST) 전
 * 새벽 시간대엔 자동으로 어제 날짜가 되어, "오늘 라벨 + 오늘 0건" 같은 모순을 막는다.
 * 20분 단위로 캐시(크롤 주기 대비 매 요청 재계산 방지).
 */
export const fetchTrendingEvents = unstable_cache(
  computeTrendingEvents,
  ['trending-events-v6'],
  { revalidate: CACHE_REVALIDATE_SECONDS },
)
