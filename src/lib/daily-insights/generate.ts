import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import { llmCompleteDetailed } from '@/lib/llm'
import { looseJsonParse } from '@/lib/llm/parse'
import { buildCandidatePool, type KeyInsightCandidate, type PastArticleRef } from '@/lib/key-insights/candidates'
import { getKstDateString } from '@/lib/date'
import { dedupeSimilarArticles } from '@/lib/daily-insights/dedupe'
import { classifyPastArticleCategories, isRelevantPastArticle } from '@/lib/daily-insights/relevance'
import type { DailyInsightPastArticle, DailyInsightSourceArticle } from '@/lib/daily-insights/types'

// 그룹 수 목표 2~3, 최소 1(§2 확정 사항). 그룹 내부는 프롬프트 크기 억제를 위해 상위 N건으로 캡.
const MAX_GROUPS = 3
const MAX_MEMBERS_PER_GROUP = 6
// 과거기사 6개월 컷오프(§3 확정 사항) — candidates.ts 의 pastArticles 는 날짜 하한이 없어 여기서 적용.
const PAST_ARTICLE_MAX_AGE_DAYS = 180
// "그날 발행 기사만" — candidates.ts 는 그대로 두고 windowDays 만 1로 좁혀 호출(§2 파라미터화).
const DAILY_WINDOW_DAYS = 1

// ─── 그룹핑 ───────────────────────────────────────────────────────────────────
// candidates.ts 가 이미 계산해둔 suggestedCategory(엔티티·키워드그룹 매칭)를 버킷 키로 재사용.
// 여기서 하는 일은 "같은 사건 근접중복 제거"(candidates.ts 가 이미 함)가 아니라
// "서로 다른 사건들을 하나의 관점 아래 묶기"이므로 새 유사도 클러스터링을 만들지 않는다.

interface CandidateGroup {
  category: string | null
  members: KeyInsightCandidate[]
}

function buildGroups(candidates: KeyInsightCandidate[]): CandidateGroup[] {
  const buckets = new Map<string | null, KeyInsightCandidate[]>()
  for (const c of candidates) {
    const key = c.suggestedCategory ?? null
    const list = buckets.get(key) ?? []
    list.push(c)
    buckets.set(key, list)
  }

  const ranked = [...buckets.entries()].map(([category, members]) => {
    const sortedMembers = [...members].sort((a, b) => b.importanceScore - a.importanceScore)
    return {
      category,
      members: sortedMembers.slice(0, MAX_MEMBERS_PER_GROUP),
      count: members.length,
      topImportance: sortedMembers[0]?.importanceScore ?? 0,
    }
  })

  ranked.sort((a, b) => b.count - a.count || b.topImportance - a.topImportance)

  return ranked.slice(0, MAX_GROUPS).map(({ category, members }) => ({ category, members }))
}

// ─── 프롬프트(그룹당 1콜) ──────────────────────────────────────────────────────

function buildSystemPrompt(): string {
  return (
    '당신은 LG유플러스 전략기획을 총괄하는 시니어 애널리스트다. 독자는 LG유플러스 임직원이며, ' +
    '이 글은 사내 웹 포털의 일일 코너 "핵심 Insight"다. 오늘 하나의 주제로 묶인 기사 묶음을 입력으로 ' +
    '받아, 개별 기사 요약이 아니라 그 묶음을 관통하는 "관점"을 종합한다.\n\n' +
    '반드시 지켜야 할 규칙:\n' +
    '1. headline: 입력 기사들을 아우르는 관점 한 줄. 특정 기사의 제목을 그대로 베끼지 않는다.\n' +
    '2. summary_ko: 이 묶음이 왜 지금 중요한지 1~2문장.\n' +
    '3. market_trend: 시장·산업 전반의 동향. 입력 기사로 뒷받침되지 않으면 null.\n' +
    '4. competitor_trend: 경쟁사(SKT/KT/SK브로드밴드) 또는 글로벌 빅테크 동향. 입력 기사로 뒷받침되지 않으면 null.\n' +
    '5. implication: LG유플러스 관점 시사점 1~2문장 — 기회/위협인지, 무엇을 준비해야 하는지. ' +
    '"LG유플러스는"/"LGU+는" 같은 도입 문구로 시작하지 말고 본문으로 바로 시작해라.\n' +
    '6. market_trend·competitor_trend·implication 중 입력 기사로 근거가 없는 항목은 억지로 채우지 말고 null로 비운다.\n' +
    '7. 입력에 없는 사실·수치·회사명·인용을 창작하지 않는다.\n' +
    '8. JSON만 출력한다. 코드펜스·설명 문장 금지.\n\n' +
    '출력 스키마:\n' +
    '{"headline":"...","summary_ko":"...","market_trend":"...|null","competitor_trend":"...|null","implication":"...|null"}'
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
  return `주제 카테고리: ${category ?? '미분류'}\n오늘 이 주제로 묶인 기사 ${members.length}건:\n\n${lines.join('\n\n')}`
}

// ─── 파싱·환각 가드 ───────────────────────────────────────────────────────────

interface GroupCard {
  headline: string
  summary_ko: string
  market_trend: string | null
  competitor_trend: string | null
  implication: string | null
}

function parseGroupCard(raw: string): GroupCard | null {
  const parsed = looseJsonParse(raw)
  if (!parsed || typeof parsed !== 'object') return null
  const h = parsed as Record<string, unknown>

  const headline = typeof h.headline === 'string' ? h.headline.trim() : ''
  const summaryKo = typeof h.summary_ko === 'string' ? h.summary_ko.trim() : ''
  if (!headline || !summaryKo) return null

  const clean = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null)

  return {
    headline,
    summary_ko: summaryKo,
    market_trend: clean(h.market_trend),
    competitor_trend: clean(h.competitor_trend),
    implication: clean(h.implication),
  }
}

// ─── 근거 기사 / 과거 기사 — 코드에서만 채움(LLM 산문은 3C 필드만, §3 환각 가드) ──────────

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
  dayOf: string,
  headline: string,
  insightCategory: string | null,
  sourceArticles: DailyInsightSourceArticle[]
): Promise<DailyInsightPastArticle[]> {
  const cutoffMs = new Date(dayOf).getTime() - PAST_ARTICLE_MAX_AGE_DAYS * 24 * 3600 * 1000
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
  generated: number
  skipped: boolean
  failed: boolean
  reason?: string
  errorReason?: string | null
}

/**
 * 그날(KST) 발행 기사를 2~3개(최소 1개) 주제로 종합해 daily_insights 에 자동게시(§1~4).
 * 멱등: 같은 day_of 배치가 이미 있으면 skip. 그룹 단위 부분 실패 허용(성공분만 저장).
 */
export async function generateDailyInsightBatch(): Promise<GenerateDailyInsightResult> {
  const admin = createAdminClient()
  const dayOf = getKstDateString(new Date())

  const { data: existing, error: existingError } = await admin
    .from('daily_insights')
    .select('id')
    .eq('day_of', dayOf)
    .limit(1)
  if (existingError) {
    return {
      ok: false,
      dayOf,
      generated: 0,
      skipped: false,
      failed: true,
      errorReason: `기존 배치 조회 실패: ${existingError.message}`,
    }
  }
  if (existing && existing.length > 0) {
    return { ok: true, dayOf, generated: 0, skipped: true, failed: false, reason: '오늘자 배치가 이미 존재함(멱등 skip)' }
  }

  const pool = await buildCandidatePool({ windowDays: DAILY_WINDOW_DAYS })
  if (pool.candidates.length === 0) {
    return { ok: true, dayOf, generated: 0, skipped: true, failed: false, reason: '후보 없음(프리필터 통과분 0건)' }
  }

  const groups = buildGroups(pool.candidates)
  if (groups.length === 0) {
    return { ok: true, dayOf, generated: 0, skipped: true, failed: false, reason: '그룹핑 결과 0건' }
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
        `[일일Insight] ${new Date().toISOString()} dayOf=${dayOf} category=${group.category ?? '미분류'} LLM 실패: ${errorReason ?? '사유 미상'}`
      )
      continue
    }

    const card = parseGroupCard(raw)
    if (!card) {
      console.error(`[일일Insight] dayOf=${dayOf} category=${group.category ?? '미분류'} LLM 출력 파싱 실패`)
      continue
    }

    const sourceArticles = buildSourceArticles(group.members)
    const sourceContentIds = new Set(sourceArticles.map((s) => s.content_id))
    const relatedPast = await buildRelatedPast(
      group.members,
      sourceContentIds,
      dayOf,
      card.headline,
      group.category,
      sourceArticles
    )

    rows.push({
      day_of: dayOf,
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
    })
  }

  if (rows.length === 0) {
    return {
      ok: false,
      dayOf,
      generated: 0,
      skipped: false,
      failed: true,
      errorReason: lastErrorReason ?? '전 그룹 LLM 실패/출력 파싱 실패',
    }
  }

  const { error: insertError } = await admin.from('daily_insights').insert(rows)
  if (insertError) {
    console.error(`[일일Insight] ${new Date().toISOString()} dayOf=${dayOf} DB 저장 실패: ${insertError.message}`)
    return { ok: false, dayOf, generated: 0, skipped: false, failed: true, errorReason: `DB 저장 실패: ${insertError.message}` }
  }

  return { ok: true, dayOf, generated: rows.length, skipped: false, failed: false }
}
