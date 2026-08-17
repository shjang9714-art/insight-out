import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import { llmCompleteDetailed } from '@/lib/llm'
import { looseJsonParse } from '@/lib/llm/parse'
import { buildCandidatePool, type KeyInsightCandidate, type PastArticleRef } from '@/lib/key-insights/candidates'
import { getKstDateString, getKstWeekMondayString } from '@/lib/date'
import { dedupeSimilarArticles, jaccardSimilarity, titleTokens } from '@/lib/daily-insights/dedupe'
import { classifyPastArticleCategories, isRelevantPastArticle, relevanceTokens } from '@/lib/daily-insights/relevance'
import type {
  CompetitorMatrixEntry,
  DailyInsightPastArticle,
  DailyInsightSourceArticle,
  ImplicationLenses,
  NextStep,
  WeeklyFlowStep,
} from '@/lib/daily-insights/types'

// 지시서 20260715: "매일 3개(day_of)" → "매주 최대 10개(week_of)" 복귀. 콘텐츠 모델(3C 종합·
// 근거/과거기사·환각가드)은 지시서 20260711 그대로, 수집 범위·발행 주기만 주간으로 되돌린다.
const WEEKLY_WINDOW_DAYS = 7
const MAX_GROUPS = 10
const MAX_MEMBERS_PER_GROUP = 6
// 카테고리당 인사이트 상한(가이드 §4.1) — 한 카테고리가 그 주 화제를 독식하지 않도록.
const MAX_PER_CATEGORY = 2
// Tier1(자사·통신사 동향 / 사이버보안)과 AIDC·클라우드는 적격 후보가 있으면 최소 1건 확보(가이드 §4.1).
const TIER1_CATEGORIES = ['자사·통신사 동향', '사이버보안'] as const
const AIDC_CATEGORY = 'AIDC·클라우드'
const REQUIRED_MIN_CATEGORIES: string[] = [...TIER1_CATEGORIES, AIDC_CATEGORY]
// 분류된(①~⑦) 인사이트가 1개 이상이면 미분류(null) 버킷은 버린다 — 서로 무관한 기사를 억지
// 헤드라인으로 묶는 "잡동사니" 방지(지시서 20260711 fast-follow §1).
const SUPPRESS_UNCATEGORIZED_WHEN_CATEGORIZED_EXISTS = true
// 과거기사 6개월 컷오프(§3 확정 사항) — candidates.ts 의 pastArticles 는 날짜 하한이 없어 여기서 적용.
const PAST_ARTICLE_MAX_AGE_DAYS = 180
// 지시서 20260716 §4 — issueId 없는 후보(단독 클러스터)를 제목 토큰 유사도로 추가 묶어 인사이트당
// 근거기사 1건 문제를 완화. dedupe.ts 의 근접중복 임계값(0.6, 숫자까지 구분 신호)보다 느슨하되
// relevance.ts 의 과거기사 관련성 임계값(0.13, 완전히 다른 화제까지 붙을 위험)보다는 엄격하게 잡는다.
const TOPIC_MERGE_JACCARD_THRESHOLD = 0.2
// 우연한 공통 불용어 1개만으로 묶이는 걸 막는 최소 공유 토큰 수.
const TOPIC_MERGE_MIN_SHARED_TOKENS = 2
// candidates.ts 의 이슈클러스터 신뢰가드(과다연결 클러스터 배제)나 issueId 누락 때문에,
// 사실상 같은 사건(예: 같은 보도의 다른 매체 표기)이 서로 다른 클러스터로 갈라지는 경우가
// 관찰됨 — dedupe.ts 의 근접중복 임계값(0.6)보다는 살짝 낮게 잡아 "동일 사건" 교차병합.
const NEAR_DUP_CLUSTER_MERGE_THRESHOLD = 0.5

// ─── 가이드 §4.1 배제 규칙 — 벤더 제품 블로그·행사성 기사 ────────────────────────────
// "범용 시황 오피니언"은 candidates.ts→isBriefingRelevant()의 isStockMarketHeavy()가 이미 제외.
const VENDOR_PROMO_KEYWORDS = [
  '정식 출시', '신제품 출시', '단독 출시', '리뉴얼 출시', '얼리버드', '사전예약',
  '체험단 모집', '쿠폰 증정', '프로모션 진행', '이벤트 진행', '한정 특가',
]
const EVENT_COVERAGE_KEYWORDS = [
  '박람회', '전시회', '컨퍼런스 개최', '세미나 개최', '웨비나 개최', '밋업 개최',
  '해커톤 개최', '부스 운영', '기자간담회 개최',
]

function isVendorPromoOrEventNoise(title: string, summaryKo: string | null): boolean {
  const text = (title + ' ' + (summaryKo ?? '')).toLowerCase()
  return [...VENDOR_PROMO_KEYWORDS, ...EVENT_COVERAGE_KEYWORDS].some((kw) => text.includes(kw.toLowerCase()))
}

// ─── 그룹핑 ───────────────────────────────────────────────────────────────────
// candidates.ts 가 이미 계산해둔 suggestedCategory(엔티티·키워드그룹 매칭)를 1차 버킷 키로,
// 같은 카테고리 안에서는 issueId(이슈 클러스터)로 "서로 다른 화제"를 다시 나눠 카테고리당
// 최대 2건까지 뽑을 수 있게 한다(가이드 §4.1). 새 유사도 클러스터링은 만들지 않는다.

interface CandidateGroup {
  category: string | null
  members: KeyInsightCandidate[]
}

interface TopicCluster {
  category: string | null
  members: KeyInsightCandidate[]
  topImportance: number
  /** 지시서 20260716 §4-보정 — topImportance + 근거건수 소폭 보너스(최종 선정 정렬 전용). */
  selectionScore: number
}

// 여러 기사로 뒷받침되는 클러스터를 선정에서 살짝 우대(§4-보정) — 중요도가 주도해야 하므로
// importanceScore 스케일(0.6~1.0)에 비해 보너스는 작게: 기사 1건 추가당 0.02, 최대 0.06
// (근거 4건 이상부터 상한). 스코어 차이가 큰 "단독 스쿠프"가 다수기사·저중요 이슈에 밀리지 않는다.
const EVIDENCE_BONUS_PER_EXTRA_SOURCE = 0.02
const EVIDENCE_BONUS_CAP = 0.06

function computeSelectionScore(topImportance: number, memberCount: number): number {
  const bonus = Math.min(EVIDENCE_BONUS_CAP, Math.max(0, memberCount - 1) * EVIDENCE_BONUS_PER_EXTRA_SOURCE)
  return topImportance + bonus
}

function rankMembers(members: KeyInsightCandidate[]): KeyInsightCandidate[] {
  return [...members].sort((a, b) => b.importanceScore - a.importanceScore).slice(0, MAX_MEMBERS_PER_GROUP)
}

/**
 * issueId 없는 후보(candidates.ts 의 신뢰 이슈클러스터에 못 걸린 것들)를 제목 토큰 유사도로
 * 추가 그룹핑 — 지시서 20260716 §4. issueId 기반 그룹(더 신뢰 가능한 신호)은 건드리지 않는다.
 * 그리디 단일연결(single-linkage) 대신 "그룹에 누적된 토큰 합집합"과 비교해, 약한 연결 몇 개로
 * 서로 무관한 기사가 사슬처럼 딸려 들어오는 걸 억제한다.
 */
function mergeSinglesByTopic(singles: KeyInsightCandidate[]): KeyInsightCandidate[][] {
  const sorted = [...singles].sort((a, b) => b.importanceScore - a.importanceScore)

  // 도메인 공통어("AI"·"데이터센터" 등) 하나만으로 서로 다른 사건이 묶이는 걸 막는다 —
  // 이 배치(카테고리 내 단독후보 전체) 안에서 자주 등장하는 토큰은 유사도 신호에서 제외.
  const rawTokensById = new Map<string, Set<string>>()
  const docFreq = new Map<string, number>()
  for (const c of sorted) {
    const tokens = relevanceTokens(c.title)
    rawTokensById.set(c.contentId, tokens)
    for (const t of tokens) docFreq.set(t, (docFreq.get(t) ?? 0) + 1)
  }
  const commonTokenThreshold = Math.max(2, Math.ceil(sorted.length * 0.4))
  function distinctiveTokens(tokens: Set<string>): Set<string> {
    const out = new Set<string>()
    for (const t of tokens) if ((docFreq.get(t) ?? 0) < commonTokenThreshold) out.add(t)
    return out
  }

  const groups: { members: KeyInsightCandidate[]; tokenUnion: Set<string> }[] = []

  for (const c of sorted) {
    const tokens = distinctiveTokens(rawTokensById.get(c.contentId)!)
    let target: (typeof groups)[number] | null = null

    if (tokens.size > 0) {
      for (const g of groups) {
        if (g.members.length >= MAX_MEMBERS_PER_GROUP) continue
        let shared = 0
        for (const t of tokens) if (g.tokenUnion.has(t)) shared++
        if (shared < TOPIC_MERGE_MIN_SHARED_TOKENS) continue
        if (jaccardSimilarity(tokens, g.tokenUnion) >= TOPIC_MERGE_JACCARD_THRESHOLD) {
          target = g
          break
        }
      }
    }

    if (target) {
      target.members.push(c)
      for (const t of tokens) target.tokenUnion.add(t)
    } else {
      groups.push({ members: [c], tokenUnion: tokens })
    }
  }

  return groups.map((g) => g.members)
}

/**
 * issueId 기반 클러스터끼리, 또는 issueId 클러스터와 topic-merge 클러스터 사이에 실질적으로
 * 같은 사건(제목 근접중복)이 걸쳐 있으면 합친다. candidates.ts 의 이슈클러스터 신뢰가드가
 * 과다연결을 배제하면서 진짜 같은 사건도 갈라놓는 부작용을 여기서 최종 백스톱으로 잡는다.
 * dedupe.ts 의 근접중복 토큰(숫자 포함, 엄격) 기준을 그대로 쓰되 임계값만 살짝 낮춘다.
 */
function mergeNearDuplicateClusters(clusters: KeyInsightCandidate[][]): KeyInsightCandidate[][] {
  const merged: { members: KeyInsightCandidate[]; tokenSets: Set<string>[] }[] = []

  for (const clusterMembers of clusters) {
    const tokenSets = clusterMembers.map((c) => titleTokens(c.title))
    let target: (typeof merged)[number] | null = null

    for (const g of merged) {
      const isNearDup = tokenSets.some((t) => g.tokenSets.some((gt) => jaccardSimilarity(t, gt) >= NEAR_DUP_CLUSTER_MERGE_THRESHOLD))
      if (isNearDup) {
        target = g
        break
      }
    }

    if (target) {
      target.members.push(...clusterMembers)
      target.tokenSets.push(...tokenSets)
    } else {
      merged.push({ members: [...clusterMembers], tokenSets })
    }
  }

  return merged.map((g) => g.members)
}

/** 카테고리 버킷 내부를 issueId 기준 화제(클러스터)로 나눈다. issueId 없는 후보는 제목 유사도로 추가 그룹핑. */
function clusterWithinCategory(category: string | null, members: KeyInsightCandidate[]): TopicCluster[] {
  const byIssue = new Map<string, KeyInsightCandidate[]>()
  const singleCandidates: KeyInsightCandidate[] = []
  for (const c of members) {
    if (c.issueId) {
      const list = byIssue.get(c.issueId) ?? []
      list.push(c)
      byIssue.set(c.issueId, list)
    } else {
      singleCandidates.push(c)
    }
  }
  const mergedSingles = mergeSinglesByTopic(singleCandidates)
  const clusters = mergeNearDuplicateClusters([...byIssue.values(), ...mergedSingles])
  return clusters
    .map((clusterMembers) => {
      const sorted = rankMembers(clusterMembers)
      const topImportance = sorted[0]?.importanceScore ?? 0
      return { category, members: sorted, topImportance, selectionScore: computeSelectionScore(topImportance, sorted.length) }
    })
    .sort((a, b) => b.selectionScore - a.selectionScore)
}

/**
 * 미분류(null) 버킷 폴백 — "가장 강한 1개 토픽"만 남긴다. 후보 전체를 억지로 묶지 않고,
 * 최고 importance 후보의 issueId 가 있으면 같은 이슈 클러스터 멤버만, 없으면 그 후보 단독 1건.
 */
function buildUncategorizedFallback(uncategorized: KeyInsightCandidate[]): CandidateGroup {
  const sorted = [...uncategorized].sort((a, b) => b.importanceScore - a.importanceScore)
  const top = sorted[0]
  const members = top.issueId ? sorted.filter((c) => c.issueId === top.issueId) : [top]
  return { category: null, members: rankMembers(members) }
}

/**
 * §1·§4.1: 카테고리당 최대 2건, Tier1(자사·통신사/사이버보안)·AIDC·클라우드는 적격 후보가
 * 있으면 최소 1건 확보, 전체 최대 10건(최소 1건). 카테고리가 전혀 없으면 미분류 폴백 1건.
 */
function buildGroups(candidates: KeyInsightCandidate[]): CandidateGroup[] {
  const filtered = candidates.filter((c) => !isVendorPromoOrEventNoise(c.title, c.summaryKo))
  const usable = filtered.length > 0 ? filtered : candidates

  const buckets = new Map<string | null, KeyInsightCandidate[]>()
  for (const c of usable) {
    const key = c.suggestedCategory ?? null
    const list = buckets.get(key) ?? []
    list.push(c)
    buckets.set(key, list)
  }

  const categorizedEntries = [...buckets.entries()].filter(([category]) => category !== null) as [string, KeyInsightCandidate[]][]

  if (categorizedEntries.length === 0) {
    if (!SUPPRESS_UNCATEGORIZED_WHEN_CATEGORIZED_EXISTS) {
      const all = usable
      return all.length > 0 ? [{ category: null, members: rankMembers(all) }] : []
    }
    const uncategorized = buckets.get(null) ?? []
    return uncategorized.length > 0 ? [buildUncategorizedFallback(uncategorized)] : []
  }

  // 카테고리별 상위 클러스터(최대 MAX_PER_CATEGORY개)만 남긴다.
  const perCategoryClusters = new Map<string, TopicCluster[]>()
  for (const [category, members] of categorizedEntries) {
    perCategoryClusters.set(category, clusterWithinCategory(category, members).slice(0, MAX_PER_CATEGORY))
  }

  const pool: TopicCluster[] = [...perCategoryClusters.values()].flat()
  pool.sort((a, b) => b.selectionScore - a.selectionScore)

  const selected = pool.slice(0, MAX_GROUPS)

  // 필수 카테고리(Tier1 + AIDC) 최소 1건 보장 — 적격 후보가 그 주에 있는데 top-N 컷에서 밀렸으면 강제 편입.
  for (const requiredCategory of REQUIRED_MIN_CATEGORIES) {
    if (selected.some((c) => c.category === requiredCategory)) continue
    const best = perCategoryClusters.get(requiredCategory)?.[0]
    if (!best) continue // 이번 주 해당 카테고리 적격 후보 없음 — 억지 생성 금지

    if (selected.length < MAX_GROUPS) {
      selected.push(best)
      continue
    }
    // 꽉 찼으면 필수 카테고리가 아닌 것 중 가장 약한 클러스터를 대체.
    let replaceIdx = -1
    for (let i = selected.length - 1; i >= 0; i--) {
      if (!REQUIRED_MIN_CATEGORIES.includes(selected[i].category ?? '')) {
        replaceIdx = i
        break
      }
    }
    if (replaceIdx !== -1) selected[replaceIdx] = best
  }

  selected.sort((a, b) => b.selectionScore - a.selectionScore)
  return selected.map(({ category, members }) => ({ category, members }))
}

// ─── 프롬프트(그룹당 1콜) ──────────────────────────────────────────────────────

function buildSystemPrompt(): string {
  return `# Role
당신은 LG유플러스 전략기획을 총괄하는 시니어 B2B Telco 전문 애널리스트다.
당신의 임무는 사내 웹 포털의 주간 코너 "핵심 Insight"에 게재될 깊이 있는 B2B 통신/산업 분석 보고서를 작성하는 것이다. 단순 기사 요약을 넘어, 표면적 마케팅 멘트 뒤에 숨은 기술적·사업적 실체, ROI, 시장 구조 변화, 자사의 위협 요인을 냉철하고 균형 잡힌 비판적 시각으로 관통하여 분석한다. 위협뿐 아니라 기회 요인도 함께 짚어 균형을 유지한다.

# Context
독자는 LG유플러스 임직원이다. 주간 발행의 특성상 이 글 1건만 읽어도 이슈의 본질, 산업적 맥락, 경쟁사 동향, 자사 시사점까지 완벽히 이해할 수 있는 정보량과 다각도 관점을 제공해야 한다.

# Task
제공되는 기사 묶음을 입력받아, 개별 기사의 단순 나열이 아닌 전체 묶음을 관통하는 종합 인사이트를 도출하고 아래 [Rules & Constraints]와 [Output Schema]를 엄격히 준수하여 JSON 형태로만 출력하라.

# Rules & Constraints

## 1. 문체 및 작성 톤
- 모든 필드의 문장은 예외 없이 ~다체(~한다/~이다/~했다)로만 작성한다. (~습니다/~합니다/~했습니다 등 존댓말 절대 금지)
- 냉철하고 균형 잡힌 비판적 애널리스트의 어조를 유지하되, 위협과 기회를 함께 제시한다.

## 2. 근거 엄격성 및 환각 방지
- 입력 기사에 없는 사실, 수치, 회사명, 인용을 절대 창작하지 않는다.
- ROI·수치·규모는 입력 기사에 있을 때만 인용하고, 없으면 정성적으로 서술하며 절대 창작하지 않는다.
- 단, implication_lenses.action 과 next_steps 의 개연성 있는 시나리오/행동 제안 문장 자체는 허용하되, 여기에 쓰이는 회사명·수치 등 사실 요소는 창작을 금한다.

## 3. 필드별 상세 작성 규정
1. headline: 입력 기사 전체를 아우르는 관점 한 줄. 특정 기사 제목 복사 금지.
2. summary_ko: 이 이슈 묶음이 왜 지금 중요한지 1~2문장.
3. market_trend: 시장·산업 전반 동향(2~3문장). 시장 전체 각도(경쟁사/자사 동향과 중복 금지). 입력 기사에 수치(규모/변화폭)가 있으면 필수 포함 및 "왜 지금 이 움직임이 나오는지" 원인 짚기. 수치 없으면 정성적 서술. 근거 없으면 null.
4. competitor_trend: 경쟁사(SKT/KT/SK브로드밴드) 또는 글로벌 빅테크 개별 동향(2~3문장). 시장 전체와 다른 개별 사업자 움직임 중심. 수치 및 "왜 지금" 기준은 market_trend와 동일. 근거 없으면 null.
5. implication: LG유플러스 입장에서 본 시사점(2~3문장). 기회/위협 여부 및 준비 사항. market_trend/competitor_trend와 다른 자사 관점. 문장 시작 시 "LG유플러스는"·"LGU+는" 같은 주어 도입 문구 없이 본문으로 바로 시작할 것. 구버전 하위호환 폴백이므로 항상 작성한다.
6. competitor_matrix: 기사에 실제 이름이 등장하는 사업자별 이번 움직임(move)·강점/차별점(edge)·리스크/공백(risk) 배열.
   - 입력 기사에 이름이 나오지 않는 회사는 절대 포함 금지.
   - 근거가 부족한 항목의 값은 "—"로 표기.
   - 경쟁 구도 비교가 무의미한 주제(예: 일반 정책 동향)면 빈 배열 []로 작성.
7. why_it_matters: 이 이슈가 산업적·비즈니스적으로 왜 중요한지 큰 그림에서 압축 서술(1~2문장). 근거 없으면 null.
8. implication_lenses: 자사 시사점을 4갈래로 나눈 객체. 4개 렌즈 간 내용 중복 금지(표현만 바꿔 반복 금지).
   - opportunity: 선점·활용할 여지(2~3문장). 근거 없으면 이 키를 아예 생성하지 말 것.
   - risk: 방치/열세 시 위협(2~3문장). 근거 없으면 이 키를 아예 생성하지 말 것.
   - action: 이번 분기/주에 실행 가능한 구체 행동 1~2개. 팀 주어("전략기획팀은/이" 등 특정 팀명을 문장 주어로 쓰는 것) 없이, 동사로 끝나는 행동 중심 문장으로 작성한다. 마땅치 않으면 이 키를 아예 생성하지 말 것.
   - editorial: 개별 사실을 관통하는 에디터 시각의 종합 프레임(1문단). 근거 없으면 이 키를 아예 생성하지 말 것.
   - 채울 수 있는 필드가 하나도 없으면 implication_lenses 자체를 null로 둘 것.
9. next_steps: 이슈의 가능성 높은 후속 전개 3~5단계 배열.
   - 예언이 아닌 개연성 있는 시나리오로 서술할 것("~할 가능성이 있다"·"~로 이어질 수 있다" 톤).
   - 확정 사실처럼 구체적 날짜·수치·회사명 창작 금지.
   - 근거가 빈약해 전개를 그릴 수 없으면 빈 배열 []로 작성(단계 억지로 채우지 말 것).

## 4. 출력 포맷 제약
- 오직 JSON만 출력한다.
- 마크다운 코드 블록이나 앞뒤 설명 문장·인사말을 절대 포함하지 않는다.

# Output Schema
아래 스키마의 implication_lenses 4개 키는 "가능한 키 예시"다. 근거 있는 키만 포함하고, 근거 없는 키는 아예 생략하며, 전부 없으면 implication_lenses 를 null 로 둔다. 출력 JSON에는 주석을 포함하지 않는다.

{"headline":"string","summary_ko":"string","market_trend":"string | null","competitor_trend":"string | null","implication":"string","why_it_matters":"string | null","implication_lenses":{"opportunity":"string","risk":"string","action":"string","editorial":"string"} | null,"competitor_matrix":[{"company":"string","move":"string","edge":"string","risk":"string"}],"next_steps":[{"step":"string","text":"string"}]}`
}

function buildUserPrompt(category: string | null, members: KeyInsightCandidate[]): string {
  const lines = members.map((c) => {
    const summary = (c.summaryKo ?? '').replace(/\s+/g, ' ').trim().slice(0, 200)
    const companyLine = c.companies.length ? `\n언급 회사: ${c.companies.join(', ')}` : ''
    return (
      `제목: ${c.title}\n매체: ${c.sourceName} / 발행일: ${c.publishedAt ?? '미상'}` +
      companyLine +
      (summary ? `\n요약: ${summary}` : '')
    )
  })
  return `주제 카테고리: ${category ?? '미분류'}\n이번 주 이 주제로 묶인 기사 ${members.length}건:\n\n${lines.join('\n\n')}`
}

// ─── 파싱·환각 가드 ───────────────────────────────────────────────────────────

interface GroupCard {
  headline: string
  summary_ko: string
  market_trend: string | null
  competitor_trend: string | null
  implication: string | null
  why_it_matters: string | null
  implication_lenses: ImplicationLenses | null
  competitor_matrix: CompetitorMatrixEntry[]
  next_steps: NextStep[]
}

const MAX_NEXT_STEPS = 5

function parseNextSteps(raw: unknown): NextStep[] {
  if (!Array.isArray(raw)) return []
  const steps: NextStep[] = []
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue
    const e = entry as Record<string, unknown>
    const text = typeof e.text === 'string' ? e.text.trim() : ''
    if (!text || text.toLowerCase() === 'null') continue
    const step = typeof e.step === 'string' && e.step.trim() ? e.step.trim() : String(steps.length + 1)
    steps.push({ step, text })
    if (steps.length >= MAX_NEXT_STEPS) break
  }
  return steps
}

const IMPLICATION_LENS_KEYS = ['opportunity', 'risk', 'action', 'editorial'] as const

function parseImplicationLenses(raw: unknown): ImplicationLenses | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const lenses: ImplicationLenses = {}
  for (const key of IMPLICATION_LENS_KEYS) {
    const v = r[key]
    if (typeof v !== 'string') continue
    const trimmed = v.trim()
    if (trimmed && trimmed.toLowerCase() !== 'null') lenses[key] = trimmed
  }
  return Object.keys(lenses).length > 0 ? lenses : null
}

function parseGroupCard(raw: string): GroupCard | null {
  const parsed = looseJsonParse(raw)
  if (!parsed || typeof parsed !== 'object') return null
  const h = parsed as Record<string, unknown>

  const headline = typeof h.headline === 'string' ? h.headline.trim() : ''
  const summaryKo = typeof h.summary_ko === 'string' ? h.summary_ko.trim() : ''
  if (!headline || !summaryKo) return null

  // LLM이 JSON null 대신 문자열 "null"을 내려보내는 경우가 있어(더미 노출 버그), 트림 후
  // "null"(대소문자 무관)이면 실제 null로 취급한다.
  const clean = (v: unknown): string | null => {
    if (typeof v !== 'string') return null
    const trimmed = v.trim()
    if (!trimmed || trimmed.toLowerCase() === 'null') return null
    return trimmed
  }

  const matrixRaw = Array.isArray(h.competitor_matrix) ? h.competitor_matrix : []
  const competitorMatrix: CompetitorMatrixEntry[] = matrixRaw
    .map((entry): CompetitorMatrixEntry | null => {
      if (!entry || typeof entry !== 'object') return null
      const e = entry as Record<string, unknown>
      const company = typeof e.company === 'string' ? e.company.trim() : ''
      if (!company) return null
      return {
        company,
        move: typeof e.move === 'string' && e.move.trim() ? e.move.trim() : '—',
        edge: typeof e.edge === 'string' && e.edge.trim() ? e.edge.trim() : '—',
        risk: typeof e.risk === 'string' && e.risk.trim() ? e.risk.trim() : '—',
      }
    })
    .filter((e): e is CompetitorMatrixEntry => e !== null)

  return {
    headline,
    summary_ko: summaryKo,
    market_trend: clean(h.market_trend),
    competitor_trend: clean(h.competitor_trend),
    implication: clean(h.implication),
    why_it_matters: clean(h.why_it_matters),
    implication_lenses: parseImplicationLenses(h.implication_lenses),
    competitor_matrix: competitorMatrix,
    next_steps: parseNextSteps(h.next_steps),
  }
}

/**
 * §2.5① 환각 가드 — LLM 이 지어낸 회사명을 걸러낸다. 그 그룹의 근거 기사(제목+요약)에
 * 실제로 이름이 등장하는 회사만 남기고, 나머지는 통째로 버린다(부분 신뢰 안 함).
 */
function verifyCompetitorMatrix(
  matrix: CompetitorMatrixEntry[],
  members: KeyInsightCandidate[]
): CompetitorMatrixEntry[] | null {
  if (matrix.length === 0) return null
  const haystack = members
    .map((c) => `${c.title} ${c.summaryKo ?? ''}`)
    .join(' ')
    .toLowerCase()
  const verified = matrix.filter((entry) => haystack.includes(entry.company.toLowerCase()))
  return verified.length > 0 ? verified : null
}

// ─── 근거 기사 / 과거 기사 — 코드에서만 채움(LLM 산문은 3C+매트릭스 필드만, §3 환각 가드) ──

function buildSourceArticles(members: KeyInsightCandidate[]): DailyInsightSourceArticle[] {
  const adapted = members.map((c) => ({
    contentId: c.contentId,
    title: c.title,
    url: c.originalUrl,
    publishedAt: c.publishedAt,
    sourceName: c.sourceName,
  }))
  const deduped = dedupeSimilarArticles(adapted)
  return deduped.map((c) => ({
    content_id: c.contentId,
    title: c.title,
    url: c.url,
    source: c.sourceName,
    published_at: c.publishedAt,
  }))
}

async function buildRelatedPast(
  members: KeyInsightCandidate[],
  sourceContentIds: Set<string>,
  weekOf: string,
  headline: string,
  insightCategory: string | null,
  sourceArticles: DailyInsightSourceArticle[]
): Promise<DailyInsightPastArticle[]> {
  const cutoffMs = new Date(weekOf).getTime() - PAST_ARTICLE_MAX_AGE_DAYS * 24 * 3600 * 1000
  const seen = new Set<string>()
  const raw: PastArticleRef[] = []

  for (const c of members) {
    for (const p of c.pastArticles) {
      if (sourceContentIds.has(p.contentId) || seen.has(p.contentId)) continue
      if (!p.publishedAt) continue
      const t = new Date(p.publishedAt).getTime()
      if (Number.isNaN(t) || t < cutoffMs) continue
      seen.add(p.contentId)
      raw.push(p)
    }
  }

  if (raw.length === 0) return []

  // 관련성 필터(§ 후속 — 이슈 링크만으로는 통과 불가). LLM 추가 호출 없는 순수 토큰 판정.
  const referenceTitles = [headline, ...sourceArticles.map((a) => a.title)]
  const categoryByContentId = await classifyPastArticleCategories(raw.map((p) => p.contentId))
  const relevant = raw.filter((p) =>
    isRelevantPastArticle({ title: p.title, category: categoryByContentId.get(p.contentId) ?? null }, insightCategory, referenceTitles)
  )
  if (relevant.length === 0) return []

  const adapted = relevant.map((p) => ({ contentId: p.contentId, title: p.title, url: p.url, publishedAt: p.publishedAt }))
  const deduped = dedupeSimilarArticles(adapted)
  const rawById = new Map(relevant.map((p) => [p.contentId, p]))

  return deduped
    .map((p) => {
      const src = rawById.get(p.contentId)
      if (!src) return null
      return {
        content_id: p.contentId,
        title: p.title,
        url: p.url,
        source: src.sourceName,
        published_at: p.publishedAt,
        reason: `"${headline}"와 이어지는 과거 보도`,
      }
    })
    .filter((r): r is DailyInsightPastArticle => r !== null)
}

// ─── §5-A 이번 주 흐름(weekly_flows) ───────────────────────────────────────────
// 그 주 daily_insights 중 "가장 중요한 이슈" 상위 2~3건을 골라 각각 원인→사건→확산→후속발표
// →시장반응 흐름으로 재구성한다. 인사이트 생성이 끝난 rows(이미 3C·근거기사 확정됨)를 그대로
// 재료로 쓴다. rank(1=가장 중요) 로 (week_of, rank) 복합키에 저장.
const MAX_WEEKLY_FLOWS = 3
/** flow의 단계(stage) 수가 이 값 미만이면 "흐름"이 아니라 단발성 사건이므로 후보에서 제외한다.
 * "단계 수"는 화면에 렌더되는 단위와 동일하게 flow 배열 길이(WeeklyFlowStep[].length)로 센다
 * (WeeklyFlowHighlight.tsx의 flow.map()이 항목당 1개 번호 단계로 그대로 렌더). */
const MIN_FLOW_STAGES = 2

// ─── 흐름 재료 확장 — WEEKLY_WINDOW_DAYS(7)는 인사이트 창(항상 최신 유지)이라 건드리지 않고,
// "흐름 생성" 단계에서만 winner 근거기사 외에 최근 30일 관련기사를 contents에서 추가로 모은다.
// 보도가 하루에 몰리는 주(source_articles 전부 같은 날)라도, 같은 주제의 앞뒤 날짜 기사를
// 끌어와야 countDistinctKstDates(flow) >= 2 를 충족하는 "진짜" 시간 흐름을 만들 수 있다.
const FLOW_EVIDENCE_WINDOW_DAYS = 30
const FLOW_EVIDENCE_MAX_PER_DATE = 3
const FLOW_EVIDENCE_MAX_TOTAL = 12

/**
 * winner(채택된 daily_insights 행) 1건의 흐름 재료를 source_articles 밖에서 추가로 모은다.
 * contents 최근 30일 창에서 후보를 가져와, headline·source_articles 제목을 reference로 삼아
 * relevance.ts의 관련성 판정(isRelevantPastArticle)을 그대로 태워 "진짜 같은 주제"만 남긴다.
 * source_articles에 이미 있는 content_id는 제외하고, dedupeSimilarArticles로 근접중복을
 * 제거한 뒤 날짜별 대표 소수만 남겨(FLOW_EVIDENCE_MAX_PER_DATE) 총 FLOW_EVIDENCE_MAX_TOTAL건으로 캡.
 */
async function buildFlowEvidenceArticles(
  winner: Record<string, unknown>,
  admin: ReturnType<typeof createAdminClient>
): Promise<DailyInsightSourceArticle[]> {
  const headline = typeof winner.headline === 'string' ? winner.headline : ''
  if (!headline) return []
  const category = (winner.category as string | null) ?? null
  const sourceArticles = (winner.source_articles as DailyInsightSourceArticle[] | null) ?? []
  const sourceContentIds = new Set(sourceArticles.map((a) => a.content_id))

  const windowStart = new Date(Date.now() - FLOW_EVIDENCE_WINDOW_DAYS * 24 * 3600 * 1000).toISOString()

  const { data: rawContents, error } = await admin
    .from('contents')
    .select('id, title, published_at, original_url, source_id, importance_score')
    .eq('status', 'published')
    .gte('published_at', windowStart)
    .is('deleted_at', null)
    .limit(3000)
  if (error || !rawContents || rawContents.length === 0) return []

  const candidates = rawContents.filter((c) => !sourceContentIds.has(c.id))
  if (candidates.length === 0) return []

  const categoryByContentId = await classifyPastArticleCategories(candidates.map((c) => c.id))
  const referenceTitles = [headline, ...sourceArticles.map((a) => a.title)]
  const relevant = candidates.filter((c) =>
    isRelevantPastArticle({ title: c.title, category: categoryByContentId.get(c.id) ?? null }, category, referenceTitles)
  )
  if (relevant.length === 0) return []

  // 근거기사 없이 흐름 재료로만 쓰이므로 매체명이 필요 — sources는 winner 단위로 소규모 조회.
  const { data: sources } = await admin.from('sources').select('id, name')
  const sourceMap = new Map((sources ?? []).map((s) => [s.id, s.name as string]))

  const adapted = relevant
    .slice()
    .sort((a, b) => (b.importance_score ?? 0) - (a.importance_score ?? 0))
    .map((c) => ({
      contentId: c.id as string,
      title: c.title as string,
      url: c.original_url as string | null,
      publishedAt: c.published_at as string | null,
      sourceName: sourceMap.get(c.source_id as string) ?? '(미상)',
    }))

  const deduped = dedupeSimilarArticles(adapted)

  // 날짜별 대표 소수만 남긴다(중요도 내림차순으로 이미 정렬돼 있으므로 앞에서부터 자름).
  const byDate = new Map<string, typeof deduped>()
  for (const a of deduped) {
    const key = a.publishedAt ? getKstDateString(new Date(a.publishedAt)) : '미상'
    const list = byDate.get(key) ?? []
    if (list.length < FLOW_EVIDENCE_MAX_PER_DATE) {
      list.push(a)
      byDate.set(key, list)
    }
  }
  const capped = [...byDate.values()].flat()

  // 시간순(오래된 것부터)으로 정렬해 "원인→사건→확산" 서술에 자연스럽게 맞춘다.
  capped.sort((a, b) => {
    const at = a.publishedAt ? new Date(a.publishedAt).getTime() : 0
    const bt = b.publishedAt ? new Date(b.publishedAt).getTime() : 0
    return at - bt
  })

  return capped.slice(0, FLOW_EVIDENCE_MAX_TOTAL).map((c) => ({
    content_id: c.contentId,
    title: c.title,
    url: c.url,
    source: c.sourceName,
    published_at: c.publishedAt,
  }))
}

function categoryTierRank(category: string | null): number {
  if (!category) return 3
  if ((TIER1_CATEGORIES as readonly string[]).includes(category)) return 0
  if (category === AIDC_CATEGORY) return 1
  return 2
}

// 헤드라인 토큰 유사도(제목 근접중복) 또는 근거기사 절반 이상 겹침이면 "같은 주제"로 보고
// 이미 채택된 winner와 중복이라 건너뛴다 — MAX_WEEKLY_FLOWS건 중 같은 이슈가 두 번 뜨는 것 방지.
const FLOW_DUP_HEADLINE_JACCARD_THRESHOLD = 0.5
const FLOW_DUP_SOURCE_OVERLAP_RATIO = 0.5

function isSameTopicFlowWinner(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
  const aHeadline = (a.headline as string | null) ?? ''
  const bHeadline = (b.headline as string | null) ?? ''
  if (aHeadline && bHeadline) {
    const sim = jaccardSimilarity(titleTokens(aHeadline), titleTokens(bHeadline))
    if (sim >= FLOW_DUP_HEADLINE_JACCARD_THRESHOLD) return true
  }

  const aSources = (a.source_articles as DailyInsightSourceArticle[] | null) ?? []
  const bSources = (b.source_articles as DailyInsightSourceArticle[] | null) ?? []
  if (aSources.length === 0 || bSources.length === 0) return false
  const bIds = new Set(bSources.map((s) => s.content_id))
  const overlap = aSources.filter((s) => bIds.has(s.content_id)).length
  const minCount = Math.min(aSources.length, bSources.length)
  return minCount > 0 && overlap / minCount >= FLOW_DUP_SOURCE_OVERLAP_RATIO
}

/** 근거기사 수 → 카테고리 Tier → 최신성 순으로 그 주 가장 중요한 이슈 상위 max건을 고른다.
 * 점수 정렬 후 그리디로 채택하되, 이미 채택된 winner와 같은 주제(헤드라인 유사 또는 근거기사
 * 절반 이상 겹침)면 건너뛴다 — daily_insights 각 행이 별개 클러스터로 생성돼도 실질적으로
 * 같은 사건을 다루는 경우가 있어 그대로 두면 "이번 주 흐름"에 같은 주제가 중복 노출된다. */
function pickFlowWinners(rows: Record<string, unknown>[], max: number): Record<string, unknown>[] {
  if (rows.length === 0) return []
  const scored = rows.map((r) => {
    const category = (r.category as string | null) ?? null
    const sourceArticles = (r.source_articles as DailyInsightSourceArticle[] | null) ?? []
    const latestMs = sourceArticles.reduce((max, a) => {
      const t = a.published_at ? new Date(a.published_at).getTime() : NaN
      return Number.isFinite(t) ? Math.max(max, t) : max
    }, 0)
    return { row: r, tierRank: categoryTierRank(category), sourceCount: sourceArticles.length, latestMs }
  })
  scored.sort((a, b) => {
    if (a.tierRank !== b.tierRank) return a.tierRank - b.tierRank
    if (a.sourceCount !== b.sourceCount) return b.sourceCount - a.sourceCount
    return b.latestMs - a.latestMs
  })

  const winners: Record<string, unknown>[] = []
  for (const s of scored) {
    if (winners.length >= max) break
    if (winners.some((w) => isSameTopicFlowWinner(w, s.row))) continue
    winners.push(s.row)
  }
  return winners
}

function buildFlowSystemPrompt(): string {
  return (
    '당신은 LG유플러스 전략기획팀의 애널리스트다. 아래 이번 주 핵심 이슈 하나를 ' +
    '"원인 → 사건 → 확산 → 후속 발표 → 시장 반응" 시간순 흐름으로 재구성한다.\n\n' +
    '규칙:\n' +
    '1. flow는 배열 [{"phase":"원인","text":"...","articleIndex":1}, ...]. phase는 원인/사건/확산/' +
    '후속 발표/시장 반응 중 입력 근거로 실제 확인되는 것만, 시간순으로 넣는다.\n' +
    '2. articleIndex는 그 단계 문장의 근거가 된 "근거 기사" 목록의 번호(1부터 시작) 하나만 적는다. ' +
    '여러 기사에 걸쳐 있거나 특정 기사 하나로 못 좁히면 articleIndex 필드 자체를 생략한다(번호 추측·창작 금지).\n' +
    '3. 근거로 확인 안 되는 단계는 통째로 생략한다 — 5단계를 억지로 다 채우지 않는다. ' +
    '흐름을 그릴 근거가 부족하면 flow를 빈 배열 []로 둔다. 근거 기사(articleIndex)로 뒷받침되지 ' +
    '않는 단계는 반드시 제외한다. 시장 전망·추측 문장은 단계로 넣지 않는다.\n' +
    '4. 각 text는 1~2문장, 짧고 명확하게.\n' +
    '5. 날짜·수치·회사명은 입력에 있는 값만 사용한다. 창작 금지.\n' +
    '6. headline: 이번 주 이 이슈를 대표하는 한 줄.\n' +
    '7. 모든 문장은 ~다체(~한다/~이다/~했다)로만 작성하고 ~습니다체(~합니다/~입니다/~했습니다)는 ' +
    '절대 쓰지 않는다. headline·flow[].text 모두 예외 없이 적용한다.\n' +
    '8. JSON만 출력한다. 코드펜스·설명 문장 금지.\n\n' +
    '출력 스키마: {"headline":"...","flow":[{"phase":"...","text":"...","articleIndex":1}]}'
  )
}

// market_trend·competitor_trend·implication은 의도적으로 프롬프트에 넣지 않는다 — 이 필드들은
// 추측성 서술(시장 전망 등)을 포함할 수 있어, 흐름 생성 LLM에 재료로 주면 근거 기사 없는 "전망"
// 단계를 만들어낼 위험이 있다. 헤드라인·요약·근거 기사 목록만으로 시간순 사실 흐름만 재구성한다.
function buildFlowUserPrompt(winner: Record<string, unknown>, evidenceArticles: DailyInsightSourceArticle[]): string {
  const headline = winner.headline as string
  const summary = winner.summary_ko as string
  const sourcesText = evidenceArticles
    .map((a, i) => `${i + 1}. ${a.title} (${a.source}${a.published_at ? `, ${a.published_at}` : ''})`)
    .join('\n')

  return (
    `이슈 헤드라인: ${headline}\n요약: ${summary}\n` +
    `근거 기사(${evidenceArticles.length}건, articleIndex는 아래 번호를 그대로 사용):\n${sourcesText}`
  )
}

export interface WeeklyFlowGenResult {
  headline: string
  flow: WeeklyFlowStep[]
}

/** rank가 매겨진 단일 이슈의 흐름을 생성. article은 LLM이 지목한 articleIndex로 [winner의
 * source_articles + buildFlowEvidenceArticles(최근 30일 관련기사)] 합친 목록을 코드가 직접
 * 룩업해 붙인다(content_id/title/url/source/published_at 모두 원본 그대로) — LLM은 번호만
 * 고르고 사실 정보는 창작하지 않는다. */
async function generateWeeklyFlow(
  winner: Record<string, unknown>,
  admin: ReturnType<typeof createAdminClient>
): Promise<WeeklyFlowGenResult | null> {
  const sourceArticles = (winner.source_articles as DailyInsightSourceArticle[] | null) ?? []
  const evidenceArticles = await buildFlowEvidenceArticles(winner, admin)
  const combinedArticles = [...sourceArticles, ...evidenceArticles]

  const system = buildFlowSystemPrompt()
  const user = buildFlowUserPrompt(winner, combinedArticles)
  const { text: raw, errorReason } = await llmCompleteDetailed('daily_insight', system, user)
  if (!raw) {
    console.error(`[핵심Insight][주간흐름] LLM 실패: ${errorReason ?? '사유 미상'}`)
    return null
  }

  const parsed = looseJsonParse(raw)
  if (!parsed || typeof parsed !== 'object') return null
  const p = parsed as Record<string, unknown>
  const headline = typeof p.headline === 'string' ? p.headline.trim() : ''
  if (!headline) return null

  // 근거 기사(articleIndex)로 뒷받침되지 않는 단계는 추측성 서술일 위험이 커 제외한다 —
  // 모든 단계가 실제 기사에 연결돼 있어야 "흐름"으로 채택한다(§ 추측성 단계 제거).
  const flowRaw = Array.isArray(p.flow) ? p.flow : []
  const flow: WeeklyFlowStep[] = flowRaw
    .map((entry): WeeklyFlowStep | null => {
      if (!entry || typeof entry !== 'object') return null
      const e = entry as Record<string, unknown>
      const phase = typeof e.phase === 'string' ? e.phase.trim() : ''
      const text = typeof e.text === 'string' ? e.text.trim() : ''
      if (!phase || !text || text.toLowerCase() === 'null') return null

      const idxRaw = e.articleIndex
      const idx = typeof idxRaw === 'number' ? idxRaw : typeof idxRaw === 'string' ? Number(idxRaw) : NaN
      const article =
        Number.isInteger(idx) && idx >= 1 && idx <= combinedArticles.length ? combinedArticles[idx - 1] : undefined
      if (!article) return null

      return { phase, text, article }
    })
    .filter((s): s is WeeklyFlowStep => s !== null)

  // published_at 기준 시간순 정렬 — 근거 기사가 붙은 단계끼리만 재정렬한다. 근거 기사가 없는
  // 단계는 비교 불가이므로 stable sort로 원래 상대 위치를 유지한다(날짜 지어내기 방지).
  flow.sort((a, b) => {
    const at = a.article?.published_at ? new Date(a.article.published_at).getTime() : NaN
    const bt = b.article?.published_at ? new Date(b.article.published_at).getTime() : NaN
    if (!Number.isFinite(at) || !Number.isFinite(bt)) return 0
    return at - bt
  })

  return { headline, flow }
}

export interface WeeklyFlowGenEntry {
  rank: number
  headline: string
  flow: WeeklyFlowStep[]
}

/** flow의 근거 기사가 붙은 단계들의 published_at을 KST 날짜로 셌을 때 서로 다른 날짜 수.
 * 2 미만이면 진짜 시간 진행 없는 단일 사건을 억지로 단계 나눈 "가짜 흐름"이다. */
function countDistinctKstDates(flow: WeeklyFlowStep[]): number {
  const dates = new Set<string>()
  for (const step of flow) {
    if (!step.article?.published_at) continue
    const d = new Date(step.article.published_at)
    if (Number.isNaN(d.getTime())) continue
    dates.add(getKstDateString(d))
  }
  return dates.size
}

/** 그 주 상위 max(기본 3)개 이슈 각각의 흐름을 rank(1=가장 중요) 순으로 생성. LLM 실패나
 * 단계 수 미달(MIN_FLOW_STAGES 미만), 하루짜리 가짜 흐름(서로 다른 날짜 2개 미만)이면 그
 * 이슈만 건너뛰고 나머지는 계속 진행(부분 실패 허용) — 빠진 자리를 다른 후보로 억지로 채우지
 * 않고 그만큼 적은 개수로 남긴다. rank는 채택된 항목끼리 1부터 다시 매겨 빈틈이 생기지 않게 한다. */
export async function generateWeeklyFlows(
  rows: Record<string, unknown>[],
  max: number = MAX_WEEKLY_FLOWS
): Promise<WeeklyFlowGenEntry[]> {
  const admin = createAdminClient()
  const winners = pickFlowWinners(rows, max)
  const entries: WeeklyFlowGenEntry[] = []
  for (const winner of winners) {
    const result = await generateWeeklyFlow(winner, admin)
    if (!result || result.flow.length < MIN_FLOW_STAGES) continue
    if (countDistinctKstDates(result.flow) < 2) continue
    entries.push({ rank: entries.length + 1, headline: result.headline, flow: result.flow })
  }
  return entries
}

/** weekly_flows를 rank별로 멱등 upsert하고, 이번에 생성 안 된 더 낮은 rank의 기존 행(유령 행)을
 * 정리한다 — 예: 지난주엔 이슈가 3개였는데 이번엔 2개뿐이면 기존 rank=3 행을 지운다. */
async function upsertWeeklyFlows(
  admin: ReturnType<typeof createAdminClient>,
  weekOf: string,
  entries: WeeklyFlowGenEntry[]
): Promise<void> {
  if (entries.length === 0) return

  const { error: upsertError } = await admin
    .from('weekly_flows')
    .upsert(
      entries.map((e) => ({ week_of: weekOf, rank: e.rank, headline: e.headline, flow: e.flow })),
      { onConflict: 'week_of,rank' }
    )
  if (upsertError) {
    console.error(`[핵심Insight][주간흐름] weekOf=${weekOf} weekly_flows 저장 실패: ${upsertError.message}`)
    return
  }

  const maxRank = Math.max(...entries.map((e) => e.rank))
  const { error: deleteError } = await admin.from('weekly_flows').delete().eq('week_of', weekOf).gt('rank', maxRank)
  if (deleteError) {
    console.error(`[핵심Insight][주간흐름] weekOf=${weekOf} 유령 행 정리 실패: ${deleteError.message}`)
  }
}

/**
 * weekly_flows(§5-A) 자가 복구 — 이 기능 배포 전에 이미 daily_insights가 생성된 주차는
 * 정상 경로(멱등 skip)를 타 weekly_flows가 영영 안 만들어진다. 그런 주차를 만나면
 * 이미 있는 published 행으로 flow를 만들어 채운다. weekly_flows에 이미 행이 있으면 아무것도 안 함.
 */
async function backfillWeeklyFlowIfMissing(admin: ReturnType<typeof createAdminClient>, weekOf: string): Promise<void> {
  const { data: existingFlow } = await admin.from('weekly_flows').select('week_of').eq('week_of', weekOf).limit(1)
  if (existingFlow && existingFlow.length > 0) return

  const { data: weekRows, error } = await admin
    .from('daily_insights')
    .select('*')
    .eq('week_of', weekOf)
    .eq('status', 'published')
  if (error || !weekRows || weekRows.length === 0) return

  const entries = await generateWeeklyFlows(weekRows)
  await upsertWeeklyFlows(admin, weekOf, entries)
}

/** why_it_matters·implication_lenses·next_steps 백필용 — 이미 확정된 헤드라인/요약을 그대로
 * 주고, 저장돼 있는 근거 기사(제목·매체·발행일)만으로 새 필드를 다시 생성한다. */
function buildEnrichmentUserPrompt(
  category: string | null,
  headline: string,
  summaryKo: string,
  sourceArticles: DailyInsightSourceArticle[]
): string {
  const lines = sourceArticles.map(
    (a) => `제목: ${a.title}\n매체: ${a.source} / 발행일: ${a.published_at ?? '미상'}`
  )
  return (
    `주제 카테고리: ${category ?? '미분류'}\n이미 확정된 헤드라인: ${headline}\n이미 확정된 요약: ${summaryKo}\n` +
    `근거 기사 ${sourceArticles.length}건:\n\n${lines.join('\n\n')}`
  )
}

/**
 * why_it_matters·next_steps(§8·§5-B) 자가 복구 — 이 필드들이 프롬프트에 추가되기 전에
 * 생성된 주차는 값이 전부 null이라 화면에 아예 안 뜬다. 헤드라인·요약·근거기사는 이미
 * 확정된 값을 그대로 두고(재작성 안 함), 새 필드만 다시 생성해 UPDATE 한다.
 */
async function backfillMissingEnrichmentForWeek(admin: ReturnType<typeof createAdminClient>, weekOf: string): Promise<void> {
  const { data: rows, error } = await admin
    .from('daily_insights')
    .select('*')
    .eq('week_of', weekOf)
    .eq('status', 'published')
    .is('why_it_matters', null)
  if (error || !rows || rows.length === 0) return

  const system = buildSystemPrompt()

  for (const row of rows) {
    const sourceArticles = (row.source_articles as DailyInsightSourceArticle[] | null) ?? []
    if (sourceArticles.length === 0) continue

    const user = buildEnrichmentUserPrompt(row.category as string | null, row.headline as string, row.summary_ko as string, sourceArticles)
    const { text: raw, errorReason } = await llmCompleteDetailed('daily_insight', system, user)
    if (!raw) {
      console.error(`[핵심Insight][백필] id=${row.id} LLM 실패: ${errorReason ?? '사유 미상'}`)
      continue
    }

    const card = parseGroupCard(raw)
    if (!card) {
      console.error(`[핵심Insight][백필] id=${row.id} 출력 파싱 실패`)
      continue
    }

    const { error: updateError } = await admin
      .from('daily_insights')
      .update({
        why_it_matters: card.why_it_matters,
        implication_lenses: card.implication_lenses,
        next_steps: card.next_steps.length > 0 ? card.next_steps : null,
      })
      .eq('id', row.id)
    if (updateError) {
      console.error(`[핵심Insight][백필] id=${row.id} 저장 실패: ${updateError.message}`)
    }
  }
}

// ─── 메인 함수 ────────────────────────────────────────────────────────────────

export interface GenerateDailyInsightResult {
  ok: boolean
  dayOf: string
  weekOf: string
  generated: number
  skipped: boolean
  failed: boolean
  reason?: string
  errorReason?: string | null
  /** dryRun 전용 — 실제로 insert 되지 않은 미리보기 행(검증용). 운영 호출에서는 항상 undefined. */
  previewRows?: Record<string, unknown>[]
  /** dryRun 전용 — weekly_flows 에 실제로 upsert 되지 않은 미리보기(검증용, rank 순 배열). */
  previewWeeklyFlows?: WeeklyFlowGenEntry[]
}

/**
 * 지난 7일(KST) 발행 기사를 최대 10개(최소 1개) 주제로 종합해 daily_insights 에 자동게시.
 * 멱등: 같은 week_of 배치가 이미 있으면 skip. 그룹 단위 부분 실패 허용(성공분만 저장).
 * day_of = week_of = 배치 실행 주의 월요일(KST) — 기존 day_of 기반 화면 로직과 호환 유지.
 * @param opts.dryRun true면 멱등 체크·DB insert를 모두 건너뛰고 생성될 행만 previewRows로 반환
 *   (지시서 20260715 검증 — 이미 이번 주 배치가 있는 상태에서 로직만 검증할 때 사용, 운영 경로 아님).
 */
export async function generateDailyInsightBatch(opts?: { dryRun?: boolean }): Promise<GenerateDailyInsightResult> {
  const dryRun = opts?.dryRun ?? false
  const admin = createAdminClient()
  const now = new Date()
  const dayOf = getKstDateString(now)
  const weekOf = getKstWeekMondayString(now)

  if (!dryRun) {
    // status='rejected'(반려·재생성 대비 보존)는 "이미 배치가 있다"로 치지 않는다 — published만 카운트.
    const { data: existing, error: existingError } = await admin
      .from('daily_insights')
      .select('id')
      .eq('week_of', weekOf)
      .eq('status', 'published')
      .limit(1)
    if (existingError) {
      return {
        ok: false,
        dayOf,
        weekOf,
        generated: 0,
        skipped: false,
        failed: true,
        errorReason: `기존 배치 조회 실패: ${existingError.message}`,
      }
    }
    if (existing && existing.length > 0) {
      // daily_insights는 멱등 skip이지만, weekly_flows(§5-A)·why_it_matters/next_steps(§8·§5-B)는
      // 이 기능들이 배포되기 전에 생성된 주차라 아직 없을 수 있다 — 있는 published 행으로
      // 자가 복구 생성(백필)한다. 헤드라인·3C 등 기존 확정 값은 건드리지 않는다.
      await backfillWeeklyFlowIfMissing(admin, weekOf)
      await backfillMissingEnrichmentForWeek(admin, weekOf)
      return { ok: true, dayOf, weekOf, generated: 0, skipped: true, failed: false, reason: '이번 주 배치가 이미 존재함(멱등 skip)' }
    }
  }

  const pool = await buildCandidatePool({ windowDays: WEEKLY_WINDOW_DAYS })
  if (pool.candidates.length === 0) {
    return { ok: true, dayOf, weekOf, generated: 0, skipped: true, failed: false, reason: '후보 없음(프리필터 통과분 0건)' }
  }

  const groups = buildGroups(pool.candidates)
  if (groups.length === 0) {
    return { ok: true, dayOf, weekOf, generated: 0, skipped: true, failed: false, reason: '그룹핑 결과 0건' }
  }

  const system = buildSystemPrompt()
  const rows: Record<string, unknown>[] = []
  let lastErrorReason: string | null = null

  // 그룹별 순차 LLM 호출(동시 호출 시 provider 쿼터 경합 우려 — 기존 크롤 아키텍처 이슈 반영).
  for (const group of groups) {
    const user = buildUserPrompt(group.category, group.members)
    const { text: raw, errorReason } = await llmCompleteDetailed('daily_insight', system, user)
    if (!raw) {
      lastErrorReason = errorReason
      console.error(
        `[핵심Insight] ${new Date().toISOString()} weekOf=${weekOf} category=${group.category ?? '미분류'} LLM 실패: ${errorReason ?? '사유 미상'}`
      )
      continue
    }

    const card = parseGroupCard(raw)
    if (!card) {
      console.error(`[핵심Insight] weekOf=${weekOf} category=${group.category ?? '미분류'} LLM 출력 파싱 실패`)
      continue
    }

    const sourceArticles = buildSourceArticles(group.members)
    const sourceContentIds = new Set(sourceArticles.map((s) => s.content_id))
    const relatedPast = await buildRelatedPast(
      group.members,
      sourceContentIds,
      weekOf,
      card.headline,
      group.category,
      sourceArticles
    )
    const competitorMatrix = verifyCompetitorMatrix(card.competitor_matrix, group.members)

    rows.push({
      day_of: weekOf,
      week_of: weekOf,
      status: 'published',
      needs_review: true,
      display_order: rows.length + 1,
      category: group.category,
      headline: card.headline,
      summary_ko: card.summary_ko,
      market_trend: card.market_trend,
      competitor_trend: card.competitor_trend,
      implication: card.implication,
      why_it_matters: card.why_it_matters,
      implication_lenses: card.implication_lenses,
      source_articles: sourceArticles.length > 0 ? sourceArticles : null,
      related_past: relatedPast.length > 0 ? relatedPast : null,
      competitor_matrix: competitorMatrix,
      next_steps: card.next_steps.length > 0 ? card.next_steps : null,
    })
  }

  if (rows.length === 0) {
    return {
      ok: false,
      dayOf,
      weekOf,
      generated: 0,
      skipped: false,
      failed: true,
      errorReason: lastErrorReason ?? '전 그룹 LLM 실패/출력 파싱 실패',
    }
  }

  // §5-A 이번 주 흐름 — daily_insight 배치와 같은 주기로 갱신. 실패해도 본 배치는 막지 않는다.
  const weeklyFlowEntries = await generateWeeklyFlows(rows)

  if (dryRun) {
    return {
      ok: true,
      dayOf,
      weekOf,
      generated: rows.length,
      skipped: false,
      failed: false,
      previewRows: rows,
      previewWeeklyFlows: weeklyFlowEntries,
    }
  }

  const { error: insertError } = await admin.from('daily_insights').insert(rows)
  if (insertError) {
    console.error(`[핵심Insight] ${new Date().toISOString()} weekOf=${weekOf} DB 저장 실패: ${insertError.message}`)
    return { ok: false, dayOf, weekOf, generated: 0, skipped: false, failed: true, errorReason: `DB 저장 실패: ${insertError.message}` }
  }

  await upsertWeeklyFlows(admin, weekOf, weeklyFlowEntries)

  return { ok: true, dayOf, weekOf, generated: rows.length, skipped: false, failed: false }
}
