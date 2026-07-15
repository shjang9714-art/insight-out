import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import { llmCompleteDetailed } from '@/lib/llm'
import { looseJsonParse } from '@/lib/llm/parse'
import { buildCandidatePool, type KeyInsightCandidate, type PastArticleRef } from '@/lib/key-insights/candidates'
import { getKstDateString, getKstWeekMondayString } from '@/lib/date'
import { dedupeSimilarArticles } from '@/lib/daily-insights/dedupe'
import { classifyPastArticleCategories, isRelevantPastArticle } from '@/lib/daily-insights/relevance'
import type { CompetitorMatrixEntry, DailyInsightPastArticle, DailyInsightSourceArticle } from '@/lib/daily-insights/types'

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
}

function rankMembers(members: KeyInsightCandidate[]): KeyInsightCandidate[] {
  return [...members].sort((a, b) => b.importanceScore - a.importanceScore).slice(0, MAX_MEMBERS_PER_GROUP)
}

/** 카테고리 버킷 내부를 issueId 기준 화제(클러스터)로 나눈다. issueId 없는 후보는 각자 단독 클러스터. */
function clusterWithinCategory(category: string | null, members: KeyInsightCandidate[]): TopicCluster[] {
  const byIssue = new Map<string, KeyInsightCandidate[]>()
  const singles: KeyInsightCandidate[][] = []
  for (const c of members) {
    if (c.issueId) {
      const list = byIssue.get(c.issueId) ?? []
      list.push(c)
      byIssue.set(c.issueId, list)
    } else {
      singles.push([c])
    }
  }
  const clusters = [...byIssue.values(), ...singles]
  return clusters
    .map((clusterMembers) => {
      const sorted = rankMembers(clusterMembers)
      return { category, members: sorted, topImportance: sorted[0]?.importanceScore ?? 0 }
    })
    .sort((a, b) => b.topImportance - a.topImportance)
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
  pool.sort((a, b) => b.topImportance - a.topImportance)

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

  selected.sort((a, b) => b.topImportance - a.topImportance)
  return selected.map(({ category, members }) => ({ category, members }))
}

// ─── 프롬프트(그룹당 1콜) ──────────────────────────────────────────────────────

function buildSystemPrompt(): string {
  return (
    '당신은 LG유플러스 전략기획을 총괄하는 시니어 애널리스트다. 독자는 LG유플러스 임직원이며, ' +
    '이 글은 사내 웹 포털의 주간 코너 "핵심 Insight"다. 이번 주 하나의 주제로 묶인 기사 묶음을 입력으로 ' +
    '받아, 개별 기사 요약이 아니라 그 묶음을 관통하는 "관점"을 종합한다.\n\n' +
    '반드시 지켜야 할 규칙:\n' +
    '1. headline: 입력 기사들을 아우르는 관점 한 줄. 특정 기사의 제목을 그대로 베끼지 않는다.\n' +
    '2. summary_ko: 이 묶음이 왜 지금 중요한지 1~2문장.\n' +
    '3. market_trend: 시장·산업 전반의 동향. 입력 기사로 뒷받침되지 않으면 null.\n' +
    '4. competitor_trend: 경쟁사(SKT/KT/SK브로드밴드) 또는 글로벌 빅테크 동향. 입력 기사로 뒷받침되지 않으면 null.\n' +
    '5. implication: LG유플러스 관점 시사점 1~2문장 — 기회/위협인지, 무엇을 준비해야 하는지. ' +
    '"LG유플러스는"/"LGU+는" 같은 도입 문구로 시작하지 말고 본문으로 바로 시작해라.\n' +
    '6. market_trend·competitor_trend·implication 중 입력 기사로 근거가 없는 항목은 억지로 채우지 말고 null로 비운다.\n' +
    '7. competitor_matrix: 이 주제에 실제로 이름이 등장하는 사업자별 이번 움직임(move)·강점/차별점(edge)·' +
    '리스크·공백(risk)을 배열로. 입력 기사에 이름이 나오지 않는 회사는 절대 포함하지 않는다. ' +
    '근거가 부족한 항목의 값은 "—"로 둔다. 경쟁 구도 비교가 무의미한 주제(예: 일반 정책 동향)면 빈 배열 []로 둔다.\n' +
    '8. 입력에 없는 사실·수치·회사명·인용을 창작하지 않는다.\n' +
    '9. JSON만 출력한다. 코드펜스·설명 문장 금지.\n\n' +
    '출력 스키마:\n' +
    '{"headline":"...","summary_ko":"...","market_trend":"...|null","competitor_trend":"...|null",' +
    '"implication":"...|null","competitor_matrix":[{"company":"...","move":"...","edge":"...","risk":"..."}]}'
  )
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
  competitor_matrix: CompetitorMatrixEntry[]
}

function parseGroupCard(raw: string): GroupCard | null {
  const parsed = looseJsonParse(raw)
  if (!parsed || typeof parsed !== 'object') return null
  const h = parsed as Record<string, unknown>

  const headline = typeof h.headline === 'string' ? h.headline.trim() : ''
  const summaryKo = typeof h.summary_ko === 'string' ? h.summary_ko.trim() : ''
  if (!headline || !summaryKo) return null

  const clean = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null)

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
    competitor_matrix: competitorMatrix,
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
    const { data: existing, error: existingError } = await admin
      .from('daily_insights')
      .select('id')
      .eq('week_of', weekOf)
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
      source_articles: sourceArticles.length > 0 ? sourceArticles : null,
      related_past: relatedPast.length > 0 ? relatedPast : null,
      competitor_matrix: competitorMatrix,
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

  if (dryRun) {
    return { ok: true, dayOf, weekOf, generated: rows.length, skipped: false, failed: false, previewRows: rows }
  }

  const { error: insertError } = await admin.from('daily_insights').insert(rows)
  if (insertError) {
    console.error(`[핵심Insight] ${new Date().toISOString()} weekOf=${weekOf} DB 저장 실패: ${insertError.message}`)
    return { ok: false, dayOf, weekOf, generated: 0, skipped: false, failed: true, errorReason: `DB 저장 실패: ${insertError.message}` }
  }

  return { ok: true, dayOf, weekOf, generated: rows.length, skipped: false, failed: false }
}
