import 'server-only'

import { createClient } from '@supabase/supabase-js'
import { unstable_cache } from 'next/cache'
import { getKstDateString, getKstDayStartIso } from '@/lib/date'
import { llmCompleteDetailed, type LlmTask } from '@/lib/llm'

/**
 * 쿠키 비의존 anon 클라이언트 — unstable_cache로 요청 간 캐시하려면 특정 사용자
 * 세션에 묶이면 안 된다. trending_keywords·trending_basis_articles 뷰가 anon에
 * GRANT되어 있어(지시서 548 선행 SQL) 이 클라이언트로 충분(기반 테이블 RLS는 뷰가 우회).
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
const SUBCLUSTER_SIM = 0.35 // 이슈 내부 서브클러스터링(느슨 — 같은 사건 다매체 픽업 흡수용)
// 공유 엔티티만으로 union하면 "삼성전자"가 달린 기사 수백 건이 제목과 무관하게 연쇄
// 연결돼 한 덩어리가 된다(지시서 548 §1-3). 엔티티는 단독 트리거가 아니라 임계를
// 낮춰주는 보조 신호로만 쓴다(§2-3).
const SUBCLUSTER_SIM_WITH_ENTITY = 0.22
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
// 회사를 하나라도 못 알아본 쌍(예: SK AX·SAP — 사전 미등재)은 기존에 무조건 병합 금지였다
// (§1-4). 사전이 영원히 완전할 수 없으므로, 회사 게이트를 못 쓰는 쌍은 "같은 회사 확인된
// 쌍"보다 훨씬 엄격한 임계로 핵심어 겹침만 본다(§2-7).
const UNKNOWN_COMPANY_OVERLAP_SIM = 0.34
const MIN_SUBCLUSTER = 2
const SURGE_CHANGE_PCT_THRESHOLD = 30
const CACHE_REVALIDATE_SECONDS = 20 * 60 // 20분 — 크롤 주기(1일 1회) 대비 매 요청 재계산 방지

// ─── 랭킹 점수 (지시서 548) ──────────────────────────────────────────────────
// score = sourceCount^SOURCE_EXPONENT × burst
//  - sourceCount : 슬롯 내 distinct source_key 수 = "몇 개 언론사가 이 사건을 다뤘나"
//    기사 건수 대신 이걸 주 볼륨으로 쓴다. 한 매체가 후속기사 5건 쏟아낸 것과
//    서로 다른 5개 매체가 동시 보도한 것을 구분하기 위함(후자가 진짜 큰 뉴스).
//  - burst : 이슈의 72h 건수 / 직전 72h 건수 — "평소 대비 얼마나 튀었나".
//    이게 있어야 상시 대형 테마(#AI)가 상단을 독점하지 않는다.
// ⚠ source_trust_tier는 실측상 전 매체 1이라(§1-5) 이번엔 곱하지 않는다.
//   등급이 채워지면 여기에 가중을 얹는다.
const SOURCE_EXPONENT = 0.8
const BURST_MULTIPLIER_MIN = 0.5
const BURST_MULTIPLIER_MAX = 4 // 신규 이슈(prev=0)가 무한대로 튀는 것 방지
// 노이즈 게이트 — 최소 2개 언론사가 다룬 사건만 순위에 올린다(§1-1 지역·대학 기사 배제).
const MIN_SOURCE_COUNT = 2

function computeBurst(recentCount: number, prevCount: number): number {
  const raw = recentCount / Math.max(prevCount, 1)
  return Math.min(Math.max(raw, BURST_MULTIPLIER_MIN), BURST_MULTIPLIER_MAX)
}

function computeScore(sourceCount: number, burst: number): number {
  return Math.pow(Math.max(sourceCount, 1), SOURCE_EXPONENT) * burst
}

// ─── 타입 ────────────────────────────────────────────────────────────────────

interface TrendingIssueRow {
  issue_id: string
  title: string
  recent_count: number
  prev_count: number
}

interface ArticleRow {
  contentId: string
  title: string
  normTitle: string
  collectedAt: string
  /** trending_basis_articles 뷰가 이미 company·product·person만 골라 담는다(전부 concrete). */
  entityNames: string[]
  matchedKeywords: string[]
  clusterId: string | null
  sourceKey: string | null
}

export interface TrendingEventsResult {
  events: TrendingEvent[]
  /**
   * 기준일 KST 날짜('YYYY-MM-DD'). 오늘(KST)에 트렌딩 대상 기사가 있으면 오늘,
   * 없으면(당일 크론 05:00 KST 전 새벽 등) 데이터가 있는 가장 최근 직전 KST 날짜로
   * 자동 전환된다(2026-07-14 재설계 — "무조건 오늘 고정"이었던 이전 버전은 크론 전
   * 새벽에 빈 화면만 뜨는 문제가 있었음). 순위·건수·대표기사는 항상 이 기준일
   * "하루"만의 기사로 계산하며(72h 윈도우로 다른 날짜 기사가 섞이지 않음), 헤더 라벨·
   * "오늘 N건" 문구도 전부 이 기준일을 따라간다(기준일이 어제면 "오늘"이라 부르지 않음).
   */
  asOfDateKst: string
  /** true면 기반 데이터 페이지네이션 캡에 도달해 일부 기사가 누락된 채 계산됐다는 뜻(§2-4). */
  truncated: boolean
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
  /** 기준일(asOfDateKst) 하루 동안의 발행 건수 — 기준일이 항상 오늘은 아님(위 asOfDateKst 참고) */
  todayCount: number
  changePct: number | null
  changeFlag: 'surge' | null
}

/**
 * §3(LLM 의미 병합) 계산 파이프라인 내부에서만 쓰는 확장 타입 — 병합 시 distinct
 * content_id 재계산·backfill 중복 방지에 필요한 원본 소스 정보를 들고 다닌다.
 * 공개 API(TrendingEventsResult.events)에는 TrendingEvent 형태로만 노출된다.
 */
interface InternalEvent extends TrendingEvent {
  /** 이 슬롯을 구성하는 모든 기준일자 기사 content_id(병합 전엔 자기 서브클러스터 것만). */
  contentIds: string[]
  /** 이 슬롯이 소비한 모든 issue_id(병합 전엔 자기 이슈 1개) — backfill 중복 방지용. */
  issueIds: string[]
  /** 대표 기사 collected_at — 병합 시 대표 재선정 동률 tie-break(최신 우선)에 사용. */
  representativeCollectedAt: string
  /** 슬롯 내 distinct source_key 수 — score 계산·MIN_SOURCE_COUNT 게이트에 사용. */
  sourceCount: number
  /** 슬롯이 흡수한 이슈들의 burst 중 최댓값. */
  burst: number
  /** sourceCount^SOURCE_EXPONENT × burst — 랭킹 정렬 1순위. */
  score: number
}

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
  'SK AX': 'SK AX',
  'SAP': 'SAP',
  '오라클': '오라클',
  '마이크로소프트': '마이크로소프트',
  'MS': '마이크로소프트',
  '구글': '구글',
  '아마존': '아마존',
  'AWS': '아마존',
  '엔비디아': '엔비디아',
  '인텔': '인텔',
  'AMD': 'AMD',
  'TSMC': 'TSMC',
  '애플': '애플',
  '메타': '메타',
  '오픈AI': '오픈AI',
  'OpenAI': '오픈AI',
  '앤스로픽': '앤스로픽',
  '퀄컴': '퀄컴',
  '브로드컴': '브로드컴',
  '팔란티어': '팔란티어',
  '쿠팡': '쿠팡',
  '토스': '토스',
  '포스코': '포스코',
  '한화': '한화',
  '두산': '두산',
  'HD현대': 'HD현대',
  'CJ': 'CJ',
  '롯데': '롯데',
  '크래프톤': '크래프톤',
  '엔씨소프트': '엔씨소프트',
  '넥슨': '넥슨',
  'KT클라우드': 'KT클라우드',
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
    for (const name of a.entityNames) {
      freq.set(name, (freq.get(name) ?? 0) + 1)
    }
  }
  let best: string | null = null
  let bestCount = 0
  for (const [name, count] of freq) {
    if (count > bestCount) { best = name; bestCount = count }
  }
  return best
}

// ─── 해시태그 라벨 (§2-8) ─────────────────────────────────────────────────────
// matched_keywords[0]는 관련도가 아니라 매칭 순서라 본문에 스친 단어가 라벨로 붙는
// 오류가 있었다(§1-6). 헤드라인에 실제 등장하는 키워드를 우선하고, 없으면 슬롯 내
// 반복 빈도로 대체하며, 그래도 없으면 null(틀린 라벨보다 무라벨이 낫다).
function pickSlotHashtag(headline: string, articles: ArticleRow[]): string | null {
  const inHeadline = articles
    .flatMap(a => a.matchedKeywords)
    .filter(k => headline.includes(k))
    .sort((a, b) => b.length - a.length)

  if (inHeadline.length > 0) return inHeadline[0]

  const freq = new Map<string, number>()
  for (const a of articles) {
    for (const k of a.matchedKeywords) freq.set(k, (freq.get(k) ?? 0) + 1)
  }
  let best: string | null = null
  let bestCount = 0
  for (const [k, count] of freq) {
    if (count >= 2 && count > bestCount) { best = k; bestCount = count }
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
  /** 그룹에 속한 모든 기준일자 기사 content_id — §3 LLM 병합 시 distinct dedup에 사용. */
  contentIds: string[]
  /** 대표 기사 collected_at — §3 병합 대표 재선정 tie-break에 사용. */
  representativeCollectedAt: string
}

/**
 * 이슈 하나의 "기준일 하루"(호출부에서 이미 단일 날짜로 필터된 articles만 받음)를
 * 제목 유사도·핵심 엔티티 공유 기준으로 서브클러스터링(실제로 묶인 size≥2 사건만).
 * 입력이 이미 단일 날짜로 필터돼 있으므로 count === todayCount.
 */
function subclusterIssue(articles: ArticleRow[]): SubclusterResult[] {
  if (articles.length === 0) return []

  const uf = new UnionFind(articles.length)

  // §2-2: 크롤러가 수집 시점에 이미 판정한 "같은 기사"(cluster_id)를 union-find 초기화
  // 직전에 무조건 묶는다. 대표는 cluster_id=null(키=자기 contentId), 멤버는 대표 id를
  // 가리키므로(키=대표 contentId) 같은 클러스터 기사끼리는 반드시 같은 키로 만난다.
  const clusterKeyToIndex = new Map<string, number>()
  articles.forEach((a, i) => {
    const key = a.clusterId ?? a.contentId
    const first = clusterKeyToIndex.get(key)
    if (first !== undefined) uf.union(first, i)
    else clusterKeyToIndex.set(key, i)
  })

  for (let i = 0; i < articles.length; i++) {
    for (let j = i + 1; j < articles.length; j++) {
      const sim = similarity(articles[i].normTitle, articles[j].normTitle)
      const sharedEntity = articles[i].entityNames.some(name => articles[j].entityNames.includes(name))
      // §2-3: 엔티티 공유는 단독 병합 트리거가 아니라 임계를 낮춰주는 보조 신호로만 쓴다
      // (블롭 방지 — 지시서 548 §1-3).
      if (sim >= SUBCLUSTER_SIM || (sharedEntity && sim >= SUBCLUSTER_SIM_WITH_ENTITY)) uf.union(i, j)
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
        topHashtag: pickSlotHashtag(representative.title, group),
        count: group.length,
        todayCount: group.length,
        contentIds: group.map(a => a.contentId),
        representativeCollectedAt: representative.collectedAt,
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

  // §2-7: 사전이 영원히 완전할 수 없다(예: SK AX·SAP — 미등재). 회사를 하나라도 못
  // 알아본 쌍은 무조건 병합 금지 대신, "같은 회사로 확인된 쌍"보다 훨씬 엄격한 임계로
  // 핵심어 겹침만 본다.
  if (companyA === null || companyB === null) {
    return keywordOverlap(a.headline, b.headline) >= UNKNOWN_COMPANY_OVERLAP_SIM
  }

  return keywordOverlap(a.headline, b.headline) >= HEADLINE_KEYWORD_OVERLAP_SIM
}

/**
 * 최종 리스트(primary + degrade backfill) 전체에 대해 한 번 더 near-dup 붕괴 패스를 돈다.
 * primary 단계의 isDuplicateEvent 억제는 backfill 항목(§main final.push 구간)엔 적용되지
 * 않아, 같은 사건이 여러 이슈로 쪼개진 채 backfill로 각각 노출되는 문제가 있었다(§2).
 * 같은 사건으로 판정되면 recentCount가 더 높은 쪽만 남긴다.
 */
function collapseDuplicateEvents(events: InternalEvent[]): InternalEvent[] {
  const kept: InternalEvent[] = []
  for (const ev of events) {
    const dupIndex = kept.findIndex(k => isDuplicateEvent(k, ev))
    if (dupIndex === -1) {
      kept.push(ev)
    } else if (compareByScoreDesc(ev, kept[dupIndex]) < 0) {
      kept[dupIndex] = ev
    }
  }
  return kept
}

/** score 내림차순 → sourceCount desc → todayCount desc → changePct desc(null 최우선) (§2-5). */
function compareByScoreDesc(a: InternalEvent, b: InternalEvent): number {
  if (b.score !== a.score) return b.score - a.score
  if (b.sourceCount !== a.sourceCount) return b.sourceCount - a.sourceCount
  if (b.todayCount !== a.todayCount) return b.todayCount - a.todayCount
  const aPct = a.changePct === null ? Infinity : a.changePct
  const bPct = b.changePct === null ? Infinity : b.changePct
  return bPct - aPct
}

// ─── §3 LLM 의미 기반 근접중복 병합 ───────────────────────────────────────────
// §2 헤드라인 텍스트 휴리스틱(회사 게이트+핵심어 겹침)의 한계: "SK하이닉스 나스닥 상장"
// 같은 한 사건이 헤드라인 어휘만 크게 달라(예: "환율 숨통" vs "40조 조달" vs "나스닥
// 데뷔") keywordOverlap이 낮게 나와 병합되지 않고 여러 칸을 차지하는 실측 사례
// (2026-07-13, 6칸). 기존 LLM(요약/후보생성에 쓰는 llmCompleteDetailed, task별 라우팅
// 재사용)에 기준일 상위 후보 헤드라인만 1회 보내 "같은 실제 사건끼리 묶어라"를 판단시켜
// 이 한계를 보완한다. LLM은 "묶기 판단"만 하고, 순위·건수는 항상 코드에서 distinct
// content_id로 재계산(실행마다 순위가 LLM 응답 편차로 흔들리지 않게).
//
// fail-safe(2026-07-14 강화, 실측 배포 사고 재발 방지): LLM 호출~JSON 파싱~묶음 병합
// 재구성 전체를 buildPrimaryEvents 안에서 단 하나의 try/catch로 감싼다 — 어느 단계든
// (llmCompleteDetailed 자체는 내부적으로 절대 throw하지 않지만, 방어적으로 한 번 더
// 감쌈) 실패하면 무조건 LLM 이전(§2 휴리스틱만 적용한) heuristicPrimary로 폴백한다.
// 병합 후 결과가 비정상적으로 비었는데 heuristicPrimary엔 항목이 있는 경우도 같은
// 폴백 대상 — 화면이 깨지거나 빈 채로 나가지 않게 하는 것이 최우선이다.
const TRENDING_LLM_GROUP_TOP_N = 40
const TRENDING_LLM_TASK: LlmTask = 'classify'

interface LlmGroupCandidate {
  index: number
  headline: string
  company: string | null
  todayCount: number
}

function buildGroupingPrompt(candidates: LlmGroupCandidate[]): { system: string; user: string } {
  const system = [
    '너는 오늘자 한국어 뉴스 헤드라인을 같은 실제 사건 단위로 묶는 보조 도구다.',
    '같은 실제 사건(같은 발표·같은 계약·같은 상장·같은 인물 이슈 등)을 다룬 헤드라인끼리만 묶어라.',
    '헤드라인 어휘가 서로 달라도 같은 사건을 다룬 것이면 묶어라',
    '(예: "환율 영향" 기사와 "나스닥 데뷔" 기사가 같은 상장 사건을 다루면 같은 묶음).',
    '같은 회사를 다뤄도 실제로 다른 사건이면 반드시 나눠라. 확신이 없으면 묶지 말고 단독 그룹으로 둬라(보수적으로 판단).',
    '출력은 JSON 배열 하나만: 각 원소는 같은 사건으로 묶인 헤드라인들의 index 배열이다.',
    '모든 index가 정확히 한 번씩만 나와야 한다. 예: [[0,2,5],[1],[3,4]]',
    '설명·코드펜스·다른 텍스트 없이 JSON 배열만 출력해라.',
  ].join(' ')

  const lines = candidates
    .map(c => `${c.index}. ${c.headline}${c.company ? ` (회사: ${c.company})` : ''} — 오늘 ${c.todayCount}건`)
    .join('\n')

  const user = `다음은 오늘의 급상승 후보 헤드라인 목록이다. 같은 실제 사건끼리 묶어라.\n\n${lines}`

  return { system, user }
}

/**
 * LLM 응답에서 JSON 배열(예: [[0,2,5],[1],[3,4]])을 관용적으로 추출·검증한다.
 * 후보 전체 index를 정확히 한 번씩 커버하지 못하면(부분 응답·중복·범위 밖 index)
 * 신뢰할 수 없는 응답으로 보고 null — 호출부가 §2 휴리스틱으로 폴백한다.
 */
function parseGroupingResponse(raw: string, candidateCount: number): number[][] | null {
  const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim()

  let parsed: unknown
  try {
    parsed = JSON.parse(cleaned)
  } catch {
    const m = cleaned.match(/\[[\s\S]*\]/)
    if (!m) return null
    try {
      parsed = JSON.parse(m[0])
    } catch {
      return null
    }
  }
  if (!Array.isArray(parsed)) return null

  const seen = new Set<number>()
  const groups: number[][] = []
  for (const group of parsed) {
    if (!Array.isArray(group) || group.length === 0) return null
    const idxs: number[] = []
    for (const raw of group) {
      const idx = typeof raw === 'number' ? raw : Number(raw)
      if (!Number.isInteger(idx) || idx < 0 || idx >= candidateCount || seen.has(idx)) return null
      seen.add(idx)
      idxs.push(idx)
    }
    groups.push(idxs)
  }
  if (seen.size !== candidateCount) return null
  return groups
}

async function groupEventsByLlm(candidates: LlmGroupCandidate[]): Promise<number[][] | null> {
  if (candidates.length === 0) return null
  const { system, user } = buildGroupingPrompt(candidates)
  const { text, errorReason } = await llmCompleteDetailed(TRENDING_LLM_TASK, system, user)
  if (!text) {
    console.warn(`[trending] LLM 이벤트 그룹핑 호출 실패: ${errorReason ?? '사유 미상'}`)
    return null
  }
  const groups = parseGroupingResponse(text, candidates.length)
  if (!groups) console.warn('[trending] LLM 이벤트 그룹핑 응답 파싱 실패/불완전 — 폐기')
  return groups
}

/**
 * 같은 사건으로 묶인 멤버들을 한 슬롯으로 병합. 같은 기사가 여러 서브클러스터에 걸쳐
 * 이중집계되지 않도록 반드시 content_id 기준 distinct dedup(합산 금지) — 건수 = distinct
 * content_id 개수. 대표 헤드라인/해시태그는 멤버 중 오늘건수 최다(동률이면 최신 collectedAt).
 */
function mergeEventGroup(members: InternalEvent[], sourceKeyOf: (contentId: string) => string | null): InternalEvent {
  const contentIdSet = new Set<string>()
  const issueIdSet = new Set<string>()
  for (const m of members) {
    for (const id of m.contentIds) contentIdSet.add(id)
    for (const id of m.issueIds) issueIdSet.add(id)
  }

  const representative = [...members].sort((a, b) => {
    if (b.todayCount !== a.todayCount) return b.todayCount - a.todayCount
    return b.representativeCollectedAt.localeCompare(a.representativeCollectedAt)
  })[0]

  const distinctCount = contentIdSet.size
  // §2-5: sourceCount는 반드시 contentIds 합집합에서 재계산(멤버 값 단순 합산 금지 —
  // 같은 매체가 이중집계된다). burst는 멤버 최댓값.
  const sourceSet = new Set<string>()
  for (const id of contentIdSet) {
    const key = sourceKeyOf(id)
    if (key) sourceSet.add(key)
  }
  const sourceCount = sourceSet.size
  const burst = Math.max(...members.map(m => m.burst))
  const score = computeScore(sourceCount, burst)

  return {
    ...representative,
    recentCount: distinctCount,
    todayCount: distinctCount,
    contentIds: [...contentIdSet],
    issueIds: [...issueIdSet],
    sourceCount,
    burst,
    score,
  }
}

/**
 * primary 후보 구성: 기준일 건수 상위 N개(TRENDING_LLM_GROUP_TOP_N)만 LLM에 1회 보내
 * "같은 사건 묶기"를 시키고, 성공하면 그 결과로 병합 슬롯을 만든다 — 순위는 LLM이 준
 * 순서가 아니라 병합 후 distinct 건수로 재계산(실행마다 순위 안 흔들리게, §main 5).
 * 상위 N 밖의 나머지 후보는 §2 휴리스틱으로 이어서 근접중복만 억제(LLM 시야 밖 안전망).
 *
 * fail-safe: heuristicPrimary(§2 휴리스틱만 적용한 결과)를 항상 먼저 계산해두고,
 * LLM 호출·파싱·병합 전체를 감싼 try/catch에서 예외가 나거나, 병합 결과가 비정상적으로
 * 비어있으면(원본엔 항목이 있는데) 전부 heuristicPrimary로 폴백한다(경고 로그 남김).
 */
async function buildPrimaryEvents(
  specificEvents: InternalEvent[],
  sourceKeyOf: (contentId: string) => string | null,
): Promise<InternalEvent[]> {
  const heuristicDedup = (pool: InternalEvent[]): InternalEvent[] => {
    const result: InternalEvent[] = []
    for (const ev of pool) {
      if (!result.some(k => isDuplicateEvent(k, ev))) result.push(ev)
    }
    return result
  }

  if (specificEvents.length === 0) return []

  const heuristicPrimary = heuristicDedup(specificEvents)

  try {
    const top = specificEvents.slice(0, TRENDING_LLM_GROUP_TOP_N)
    const rest = specificEvents.slice(TRENDING_LLM_GROUP_TOP_N)

    const llmCandidates: LlmGroupCandidate[] = top.map((ev, index) => ({
      index,
      headline: ev.headline,
      company: extractDominantCompany(ev.headline),
      todayCount: ev.todayCount,
    }))

    const groups = await groupEventsByLlm(llmCandidates)
    if (!groups) return heuristicPrimary

    const mergedTop = groups.map(idxs => mergeEventGroup(idxs.map(i => top[i]), sourceKeyOf))

    const primary = [...mergedTop]
    for (const ev of rest) {
      if (!primary.some(k => isDuplicateEvent(k, ev))) primary.push(ev)
    }
    primary.sort(compareByScoreDesc)

    if (primary.length === 0) {
      console.warn('[trending] LLM 병합 결과가 비어 있어(원본엔 항목 있음) 휴리스틱 이벤트로 폴백')
      return heuristicPrimary
    }

    return primary
  } catch (e) {
    console.warn(
      '[trending] LLM 병합 파이프라인 예외 발생 — 휴리스틱 이벤트로 폴백:',
      e instanceof Error ? e.message : String(e),
    )
    return heuristicPrimary
  }
}

// ─── 메인 계산 (unstable_cache로 래핑) ────────────────────────────────────────

interface BasisArticleRow {
  content_id: string
  title: string
  collected_at: string
  matched_keywords: string[] | null
  cluster_id: string | null
  source_key: string | null
  source_trust_tier: number | null
  issue_ids: string[] | null
  entity_names: string[] | null
}

const BASIS_ARTICLES_PAGE_SIZE = 1000 // Supabase/PostgREST 기본 max-rows — 단일 .limit()로 이 이상 요청해도 서버가 조용히 잘라서 반환
const BASIS_ARTICLES_MAX_PAGES = 10 // 안전장치: 최대 10 * 1000 = 10000건까지만 페이지네이션(무한루프 방지). 실측 2,318건이라 안 걸림.

/**
 * trending_basis_articles 뷰(지시서 548 선행 SQL)에서 72h 창의 기사를 전부 기사 단위(1행=1건)로
 * 가져온다. 예전 trending_issue_articles는 이슈·엔티티 fan-out으로 같은 창에서 158,384행이
 * 나와 10,000행 캡에 걸려 실제 데이터의 6%만 보고 있었다(§1-1) — 이 뷰가 issue_ids·
 * entity_names를 배열로 접어 그 fan-out을 없앴다.
 */
async function fetchAllBasisArticles(
  supabase: ReturnType<typeof createPublicClient>,
): Promise<{ rows: BasisArticleRow[]; truncated: boolean; error: boolean; message?: string }> {
  const rows: BasisArticleRow[] = []

  for (let page = 0; page < BASIS_ARTICLES_MAX_PAGES; page++) {
    const from = page * BASIS_ARTICLES_PAGE_SIZE
    const to = from + BASIS_ARTICLES_PAGE_SIZE - 1

    const { data, error } = await supabase
      .from('trending_basis_articles')
      .select('*')
      .order('collected_at', { ascending: false })
      .range(from, to)

    if (error || !data) return { rows, truncated: false, error: true, message: error?.message }
    rows.push(...(data as BasisArticleRow[]))

    if (data.length < BASIS_ARTICLES_PAGE_SIZE) return { rows, truncated: false, error: false }

    if (page === BASIS_ARTICLES_MAX_PAGES - 1) {
      console.error(
        `[trending] basis_articles 페이지네이션 안전장치 도달 — ${BASIS_ARTICLES_MAX_PAGES * BASIS_ARTICLES_PAGE_SIZE}건 초과 가능성, 이후 데이터는 누락된 채로 계산됨`,
      )
      return { rows, truncated: true, error: false }
    }
  }

  return { rows, truncated: false, error: false }
}

export type TrendingComputeResult =
  | { ok: true; value: TrendingEventsResult }
  | { ok: false; stage: 'trending_keywords' | 'trending_issue_articles'; error: string }

/**
 * 캐시를 거치지 않는 원본 계산. cron:trending-snapshot(1일 1회 스냅샷)이 이걸 직접 호출해
 * fetchTrendingEvents()의 unstable_cache SWR 지연(아래 참고)에 영향받지 않도록 한다.
 */
export async function computeTrendingEvents(): Promise<TrendingComputeResult> {
  const supabase = createPublicClient()

  const { data: candidateData, error: viewErr } = await supabase
    .from('trending_keywords')
    .select('issue_id, title, recent_count, prev_count')

  if (viewErr) {
    return { ok: false, stage: 'trending_keywords', error: viewErr.message }
  }
  const candidates = (candidateData ?? []) as TrendingIssueRow[]
  if (candidates.length === 0) {
    return { ok: true, value: { events: [], asOfDateKst: getKstDateString(), truncated: false } }
  }

  const issueIdSet = new Set(candidates.map(c => c.issue_id))

  // trending_basis_articles 뷰는 이미 status='published' & 72h 창으로 필터링됨(지시서 548 선행 SQL).
  const { rows, truncated, error: rowsErr, message: rowsErrMessage } = await fetchAllBasisArticles(supabase)

  if (rowsErr) {
    return { ok: false, stage: 'trending_issue_articles', error: rowsErrMessage ?? '원인 미상' }
  }

  // 기준일(basisDateKst) 결정 — 2026-07-14 재설계. "오늘(KST)에 후보 풀 기사가 있으면
  // 오늘, 없으면(당일 크론 05:00 KST 전 새벽 등) 데이터가 있는 가장 최근 직전 날짜"로
  // 자동 선정한다. 직전의 "무조건 오늘 고정"(2026-07-13 결정)은 크론 전 새벽엔 항상
  // events=[]인 빈 화면만 뜨는 문제가 있었다 — 실측(2026-07-14 00시대 배포 직후):
  // 오늘자 기사 0건 → "최근 급상승 이슈가 없습니다"만 노출.
  // rows는 collected_at desc 정렬로 페이지네이션되어 있어(fetchAllBasisArticles),
  // rows[0]이 후보 풀 전체의 최신 기사 — 오늘 기사가 하나도 없으면 그 기사의 KST 날짜를
  // 기준일로 쓴다. 순위·건수·대표기사는 반드시 기준일 "하루"만 필터해서 계산한다
  // (>= 만으로 필터하면 72h 윈도우 특성상 기준일보다 오래된 기사까지 섞여 들어온다).
  const todayKstNow = getKstDateString()
  const todayStartIsoNow = getKstDayStartIso(todayKstNow)
  const hasArticleToday = rows.some(r => r.collected_at >= todayStartIsoNow)

  let basisDateKst: string
  if (hasArticleToday || rows.length === 0) {
    basisDateKst = todayKstNow
  } else {
    basisDateKst = getKstDateString(new Date(rows[0].collected_at))
  }

  const basisDayStartIso = getKstDayStartIso(basisDateKst)
  // 배타적 상한(다음날 0시) — 기준일 "하루"만 정확히 필터. 72h 윈도우로 딸려온
  // 기준일 이전 날짜 기사가 클러스터링·랭킹에 섞이는 것을 방지.
  const basisDayEndIso = new Date(new Date(basisDayStartIso).getTime() + 24 * 60 * 60 * 1000).toISOString()
  const inBasisDay = (collectedAt: string) => collectedAt >= basisDayStartIso && collectedAt < basisDayEndIso

  // §2-1: 뷰가 이미 기사 1건 = 1행이므로 content_id → ArticleRow 단일 Map 하나면 충분하다
  // (한 기사가 여러 이슈에 속해도 ArticleRow 객체는 1개만 존재 — 중복 집계 방지).
  // issue_id → content_id[] 인덱스는 row.issue_ids를 후보 이슈 집합과 교집합해서 만든다
  // (예전처럼 .in('issue_id', ...) 서버 필터가 없으므로 여기서 판정).
  const articlesById = new Map<string, ArticleRow>()
  const issueToContentIds = new Map<string, string[]>()

  for (const row of rows) {
    if (!articlesById.has(row.content_id)) {
      articlesById.set(row.content_id, {
        contentId: row.content_id,
        title: row.title,
        normTitle: normalizeTitle(row.title),
        collectedAt: row.collected_at,
        entityNames: row.entity_names ?? [],
        matchedKeywords: row.matched_keywords ?? [],
        clusterId: row.cluster_id,
        sourceKey: row.source_key,
      })
    }
    for (const issueId of row.issue_ids ?? []) {
      if (!issueIdSet.has(issueId)) continue
      if (!issueToContentIds.has(issueId)) issueToContentIds.set(issueId, [])
      issueToContentIds.get(issueId)!.push(row.content_id)
    }
  }

  const sourceKeyOf = (contentId: string): string | null => articlesById.get(contentId)?.sourceKey ?? null

  function computeSourceCount(contentIds: string[]): number {
    const sources = new Set<string>()
    for (const id of contentIds) {
      const key = sourceKeyOf(id)
      if (key) sources.add(key)
    }
    return sources.size
  }

  const specificEvents: InternalEvent[] = []
  // 이슈별 changePct/changeFlag/기준일 건수/burst — 여러 지점에서 재사용(중복 계산 방지).
  const issueChange = new Map<
    string,
    { changePct: number | null; changeFlag: 'surge' | null; todayCount: number; burst: number }
  >()

  for (const issue of candidates) {
    // "오늘의 급상승"은 기준일(basisDateKst) 하루 기사만으로 구성한다 — 클러스터링·건수·
    // 대표기사 이전에 기준일 기사만 남기고, 이후 모든 계산(subcluster size = 기준일 건수)은
    // 그 하루 기준. 72h 윈도우로 들어온 다른 날짜 기사는 여기서 전부 제외된다.
    const articles = (issueToContentIds.get(issue.issue_id) ?? [])
      .map(id => articlesById.get(id)!)
      .filter(a => inBasisDay(a.collectedAt))
    const issueTodayCount = articles.length
    // 기준일 기사가 0건인 이슈는 순위 진입 자체를 막는다.
    if (issueTodayCount === 0) continue

    const changePct = issue.prev_count > 0
      ? Math.round((issue.recent_count - issue.prev_count) / issue.prev_count * 100)
      : (issue.recent_count > 0 ? null : 0)
    const isSurge = issue.recent_count > 0 && (changePct === null || changePct > SURGE_CHANGE_PCT_THRESHOLD)
    const changeFlag = isSurge ? 'surge' as const : null
    const burst = computeBurst(issue.recent_count, issue.prev_count)
    issueChange.set(issue.issue_id, { changePct, changeFlag, todayCount: issueTodayCount, burst })

    let hasSubcluster = false
    for (const sc of subclusterIssue(articles)) {
      hasSubcluster = true

      const sourceCount = computeSourceCount(sc.contentIds)
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
        contentIds: sc.contentIds,
        issueIds: [issue.issue_id],
        representativeCollectedAt: sc.representativeCollectedAt,
        sourceCount,
        burst,
        score: computeScore(sourceCount, burst),
      })
    }

    // 이슈 내부에 유사헤드라인 2건 이상 서브클러스터가 없어도(예: 같은 사건이 issue_id별로
    // 어휘가 다른 단일기사 1건씩으로 쪼개진 경우 — 실측, 2026-07-13: SK하이닉스 나스닥 상장이
    // 이렇게 여러 issue_id로 쪼개져 여러 칸 노출), 이 이슈 대표 1건을 §3 LLM 후보 풀에 반드시
    // 포함시킨다. 이걸 빠뜨리면 이런 이슈들은 서로 다른 issue_id로 쪼개진 같은 사건을 LLM이
    // 아예 보지 못하고 계속 놓치게 된다.
    if (!hasSubcluster) {
      const sorted = [...articles].sort((a, b) => b.collectedAt.localeCompare(a.collectedAt))
      const representative = sorted[0]
      const contentIds = articles.map(a => a.contentId)
      const sourceCount = computeSourceCount(contentIds)
      specificEvents.push({
        issueId: issue.issue_id,
        contentId: representative.contentId,
        headline: representative.title,
        entityChip: dominantEntity(articles),
        topHashtag: pickSlotHashtag(representative.title, articles),
        recentCount: issueTodayCount,
        todayCount: issueTodayCount,
        changePct,
        changeFlag,
        contentIds,
        issueIds: [issue.issue_id],
        representativeCollectedAt: representative.collectedAt,
        sourceCount,
        burst,
        score: computeScore(sourceCount, burst),
      })
    }
  }

  specificEvents.sort(compareByScoreDesc)

  const primary = await buildPrimaryEvents(specificEvents, sourceKeyOf)

  // §2-6: 10칸 강제 채우기(backfill) 폐지 — 게이트 통과 못 하면 억지로 채우지 않는다.
  // 노이즈 게이트(§2-5): 최소 MIN_SOURCE_COUNT개 매체가 다룬 사건만 순위에 올린다.
  const gated = primary.filter(ev => ev.sourceCount >= MIN_SOURCE_COUNT)
  const final = gated.slice(0, TRENDING_LIMIT)

  const deduped = collapseDuplicateEvents(final)
  deduped.sort(compareByScoreDesc)

  return { ok: true, value: { events: deduped, asOfDateKst: basisDateKst, truncated } }
}

/**
 * 홈 "실시간 급상승 키워드" — `trending_keywords` 뷰(72h 발행건수 후보) 위에
 * 이슈 내부 서브이벤트 클러스터링(§5) + LLM 의미 병합(§3)을 얹어 특정 사건 단위로 반환.
 * MIN_SOURCE_COUNT(최소 매체 수) 게이트를 통과 못 하면 억지로 채우지 않는다(지시서 548
 * §2-6 — 과거 10칸 강제 backfill은 폐지).
 * 뷰가 아직 적용되지 않았으면(42P01/PGRST205 등 조회 실패) null — 호출부에서 폴백 처리.
 * `asOfDateKst`는 기준일(basisDateKst) — 오늘(KST)에 후보 기사가 있으면 오늘, 없으면
 * 데이터가 있는 가장 최근 직전 날짜로 자동 전환된다(2026-07-14 재설계). 순위·건수·
 * 헤더 라벨·"오늘 N건" 문구 전부 이 기준일 하루만 사용 — 기준일이 오늘이 아니면
 * "오늘"이라 표시하지 않는다(호출부 IssueSignals.tsx·trending/page.tsx 참고).
 * 20분 단위로 캐시(크롤 주기 대비 매 요청 재계산 방지).
 * ⚠ unstable_cache는 stale-while-revalidate — 만료 후 첫 요청은 "새로 계산 후 반환"이 아니라
 * "오래된 값을 즉시 반환 + 백그라운드 재계산"이다. 트래픽이 뜸한 새벽~야간엔 그 첫 요청이
 * 하루 종일 없을 수 있어, 크론(cron:trending-snapshot 등)이 그 유일한 "첫 요청"이 되면
 * 크롤 이전의 캐시를 그대로 받는 사고가 난다(2026-07-15 실측 — 05:00 KST 크롤 후 18시간
 * 넘게 아무도 접속하지 않아 23:50 KST 스냅샷이 전날 캐시를 그대로 저장). 그래서:
 * 1) 태그를 걸어 크롤 크론이 끝나자마자 revalidateTag(tag, 'max')로 stale 표시(아래 crawl
 *    route 참고) — Next.js 16의 'max' profile도 여전히 SWR이라 "다음 방문"이 즉시 최신값을
 *    받는 건 아니지만, 자연 만료(20분) 타이밍에 기대지 않고 크롤 완료 시점에 확실히 무효화는
 *    해둔다.
 * 2) 그것만으론 트래픽이 뜸한 날 여전히 부족할 수 있어(SWR은 "다음 방문"이 있어야 재계산이
 *    걸린다), trending-snapshot 크론 자체는 이 캐시를 아예 안 거치고 computeTrendingEvents()를
 *    직접 호출해 캐시 상태와 무관하게 항상 그 시점 실측값을 저장한다 — 이게 실질적 고정 조치.
 */
async function computeTrendingEventsOrNull(): Promise<TrendingEventsResult | null> {
  const result = await computeTrendingEvents()
  if (!result.ok) {
    console.error(`[trending] ${result.stage} 조회 실패: ${result.error}`)
    return null
  }
  return result.value
}

export const fetchTrendingEvents = unstable_cache(
  computeTrendingEventsOrNull,
  ['trending-events-v9'],
  { revalidate: CACHE_REVALIDATE_SECONDS, tags: ['trending-events'] },
)
