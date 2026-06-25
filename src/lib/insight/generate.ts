import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import { llmComplete } from '@/lib/llm'
import type { SupabaseClient } from '@supabase/supabase-js'

// ─── 타입 ─────────────────────────────────────────────────────────────────────

interface ContentRow {
  id: string
  title: string
  summary_ko: string | null
  matched_groups: string[] | null
  importance_score: number | null
  cluster_id: string | null
  collected_at: string
}

interface LlmOutput {
  headline: string
  card_headline: string
  implication: string
  citations: { content_id: string; quote: string }[]
}

interface GenerateOptions {
  days?: number
  maxThemes?: number
}

// ─── KST 날짜 유틸 ────────────────────────────────────────────────────────────

function kstDateString(offsetDays = 0): string {
  const now = Date.now()
  const kst = new Date(now + 9 * 60 * 60 * 1000)
  const shifted = new Date(kst.getTime() - offsetDays * 24 * 60 * 60 * 1000)
  const y = shifted.getUTCFullYear()
  const m = String(shifted.getUTCMonth() + 1).padStart(2, '0')
  const d = String(shifted.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/** KST 날짜(YYYY-MM-DD) → UTC 00:00 ISO 문자열 */
function kstDateToUtcIso(dateStr: string): string {
  return new Date(`${dateStr}T00:00:00+09:00`).toISOString()
}

// ─── LLM 프롬프트 ────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `당신은 LG U+ B2B 시장 인텔리전스 분석가다.
주어진 기사들로 이 주제의 핵심 동향 1줄(headline, 분석가 톤)과 LG U+ B2B(엔터프라이즈/공공/AICC·AIDC 등)에의 시사점 1~2줄(implication)을 쓰라.
추가로 card_headline: 카드뉴스 큰 글자용 에디토리얼 헤드라인. 짧고 강렬하게(공백 포함 20자 내외), 단 사실 기반 — 과장·낚시·물음표 금지, 핵심 주체와 동향은 유지.
근거 없는 주장 금지 — 각 핵심 주장은 입력 기사에서 15단어 이내 인용과 그 content_id를 citations로 제시.
JSON만 출력: {"headline":"","card_headline":"","implication":"","citations":[{"content_id":"","quote":""}]}`

function buildUserPrompt(topic: string, articles: ContentRow[]): string {
  const lines = articles
    .map((a) => `[${a.id}] ${a.title}\n${a.summary_ko ?? ''}`)
    .join('\n\n')
  return `주제: ${topic}\n\n${lines}`
}

// ─── LLM 출력 파싱 ────────────────────────────────────────────────────────────

function parseLlmOutput(raw: string): LlmOutput | null {
  try {
    const cleaned = raw
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim()
    const parsed = JSON.parse(cleaned) as unknown
    if (typeof parsed !== 'object' || parsed === null) return null
    const obj = parsed as Record<string, unknown>
    if (typeof obj.headline !== 'string' || !obj.headline) return null
    const citations = Array.isArray(obj.citations)
      ? (obj.citations as unknown[])
          .filter(
            (c): c is { content_id: string; quote: string } =>
              typeof c === 'object' &&
              c !== null &&
              typeof (c as Record<string, unknown>).content_id === 'string' &&
              typeof (c as Record<string, unknown>).quote === 'string'
          )
      : []
    const card_headline =
      typeof obj.card_headline === 'string' && obj.card_headline.trim()
        ? (obj.card_headline as string).trim()
        : (obj.headline as string)
    return {
      headline: obj.headline as string,
      card_headline,
      implication: typeof obj.implication === 'string' ? obj.implication : '',
      citations,
    }
  } catch {
    return null
  }
}

// ─── upsert 헬퍼 (card_headline 컬럼 미적용 시 graceful 폴백) ─────────────────

async function upsertInsightCard(
  adminClient: SupabaseClient,
  payload: Record<string, unknown>,
): Promise<{ error: { message: string; code?: string } | null }> {
  const first = await adminClient
    .from('insight_cards')
    .upsert(payload, { onConflict: 'period_start,scope,topic' })
  if (first.error && (first.error as { code?: string }).code === '42703' && 'card_headline' in payload) {
    const rest = { ...payload }
    delete rest.card_headline
    const retry = await adminClient
      .from('insight_cards')
      .upsert(rest, { onConflict: 'period_start,scope,topic' })
    return { error: retry.error }
  }
  return { error: first.error }
}

// ─── 메인 엔진 ────────────────────────────────────────────────────────────────

export async function generateIndustryInsightCards(
  adminClient: SupabaseClient,
  opts: GenerateOptions = {}
): Promise<{ created: number; topics: string[] }> {
  const days = Math.max(1, opts.days ?? 7)
  const maxThemes = Math.max(1, Math.min(opts.maxThemes ?? 5, 10))

  const periodEnd = kstDateString(0)
  const periodStart = kstDateString(days - 1)
  const sinceIso = kstDateToUtcIso(periodStart)

  // 1. 후보 수집
  const { data: rawContents, error: contentsError } = await adminClient
    .from('contents')
    .select('id, title, summary_ko, matched_groups, importance_score, cluster_id, collected_at')
    .eq('status', 'published')
    .gte('collected_at', sinceIso)
    .not('matched_groups', 'is', null)
    .limit(400)

  if (contentsError) {
    console.error('[InsightGen] 콘텐츠 조회 실패:', contentsError.message)
    return { created: 0, topics: [] }
  }

  const contents = (rawContents ?? []) as ContentRow[]
  const validContents = contents.filter(
    (c) => c.matched_groups && c.matched_groups.length > 0
  )

  if (validContents.length === 0) {
    console.log('[InsightGen] 태깅된 콘텐츠 없음 — 생성 건너뜀')
    return { created: 0, topics: [] }
  }

  // 2. 테마 그룹핑 — matched_groups 빈도 집계
  const groupFreq = new Map<string, ContentRow[]>()
  for (const c of validContents) {
    for (const g of c.matched_groups ?? []) {
      if (!groupFreq.has(g)) groupFreq.set(g, [])
      groupFreq.get(g)!.push(c)
    }
  }

  const topGroups = [...groupFreq.entries()]
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, maxThemes)

  const contentIdSet = new Set(validContents.map((c) => c.id))
  const created: string[] = []

  for (const [group, groupArticles] of topGroups) {
    try {
      // 클러스터 대표 우선(cluster_id null) + importance desc, 상위 8건
      const sorted = [...groupArticles].sort((a, b) => {
        const aIsRep = a.cluster_id === null ? 0 : 1
        const bIsRep = b.cluster_id === null ? 0 : 1
        if (aIsRep !== bIsRep) return aIsRep - bIsRep
        return (b.importance_score ?? 0) - (a.importance_score ?? 0)
      })
      const articles = sorted.slice(0, 8)

      // 3. LLM 생성
      const raw = await llmComplete(
        'report',
        SYSTEM_PROMPT,
        buildUserPrompt(group, articles)
      )

      if (!raw) {
        console.warn(`[InsightGen] topic="${group}" LLM 응답 없음 — 건너뜀`)
        continue
      }

      const parsed = parseLlmOutput(raw)
      if (!parsed) {
        console.warn(`[InsightGen] topic="${group}" LLM 파싱 실패 — 건너뜀`)
        continue
      }

      // 4. citation content_id 검증 (환각 차단)
      const validCitations = parsed.citations.filter((c) =>
        contentIdSet.has(c.content_id)
      )

      const sourceIds = articles.map((a) => a.id)

      // 5. 멱등 upsert
      const { error: upsertError } = await upsertInsightCard(adminClient, {
        period_start: periodStart,
        period_end: periodEnd,
        scope: 'industry',
        topic: group,
        headline: parsed.headline,
        card_headline: parsed.card_headline,
        implication: parsed.implication || null,
        source_content_ids: sourceIds,
        citations: validCitations,
        status: 'draft',
        generated_at: new Date().toISOString(),
      })

      if (upsertError) {
        console.error(`[InsightGen] topic="${group}" upsert 실패:`, upsertError.message)
      } else {
        created.push(group)
        console.log(`[InsightGen] topic="${group}" 생성 완료 (citations=${validCitations.length})`)
      }
    } catch (err) {
      console.error(
        `[InsightGen] topic="${group}" 처리 오류:`,
        err instanceof Error ? err.message : String(err)
      )
    }
  }

  return { created: created.length, topics: created }
}

// ─── 회사 카드 엔진 ───────────────────────────────────────────────────────────

interface CompanyArticleRow {
  id: string
  title: string
  summary_ko: string | null
  cluster_id: string | null
  importance_score: number | null
  collected_at: string
}

interface CompanyOptions {
  days?: number
  maxCompanies?: number
  articlesPerCompany?: number
  minArticles?: number
}

const COMPANY_SYSTEM_PROMPT =
  '당신은 LG U+ B2B 시장 인텔리전스 분석가다. 주어진 한 기업 관련 기사들로 그 기업의 **최근 핵심 동향 1줄(headline, 분석가 톤)** 과 **LG U+ B2B 관점 시사점 1~2줄(implication, 경쟁/협력/위협)** 을 쓰라. ' +
  '추가로 card_headline: 카드뉴스 큰 글자용 에디토리얼 헤드라인. 짧고 강렬하게(공백 포함 20자 내외), 단 사실 기반 — 과장·낚시·물음표 금지, 핵심 주체와 동향은 유지. ' +
  '근거 없는 주장 금지 — 각 핵심 주장은 입력 기사의 15단어 이내 인용과 content_id 를 citations 로. ' +
  'JSON만 출력: {"headline":"","card_headline":"","implication":"","citations":[{"content_id":"","quote":""}]}'

function buildCompanyUserPrompt(company: string, articles: CompanyArticleRow[]): string {
  const lines = articles
    .map((a) => `[${a.id}] ${a.title}\n${a.summary_ko ?? ''}`)
    .join('\n\n')
  return `기업: ${company}\n\n${lines}`
}

export async function generateCompanyInsightCards(
  adminClient: SupabaseClient,
  opts?: CompanyOptions,
): Promise<{ created: number; companies: string[] }> {
  const days = Math.max(1, opts?.days ?? 7)
  const maxCompanies = Math.max(1, Math.min(opts?.maxCompanies ?? 15, 30))
  const articlesPerCompany = Math.max(1, opts?.articlesPerCompany ?? 8)
  const minArticles = Math.max(1, opts?.minArticles ?? 2)

  // 1. 전체 워치리스트 조회 → lower dedup + 인기순
  const { data: watchRows, error: watchError } = await adminClient
    .from('user_watchlist')
    .select('company')

  if (watchError) {
    console.error('[CompanyInsightGen] 워치리스트 조회 실패:', watchError.message)
    return { created: 0, companies: [] }
  }

  // lower dedup + count
  const countMap = new Map<string, { original: string; count: number }>()
  for (const row of (watchRows ?? []) as { company: string }[]) {
    if (!row.company?.trim()) continue
    const lower = row.company.toLowerCase()
    if (!countMap.has(lower)) {
      countMap.set(lower, { original: row.company.trim(), count: 1 })
    } else {
      countMap.get(lower)!.count++
    }
  }

  if (countMap.size === 0) {
    console.log('[CompanyInsightGen] 워치리스트 비어 있음 — 생성 건너뜀')
    return { created: 0, companies: [] }
  }

  const sortedCompanies = [...countMap.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, maxCompanies)
    .map((v) => v.original)

  const periodEnd = kstDateString(0)
  const periodStart = kstDateString(days - 1)
  const sinceIso = kstDateToUtcIso(periodStart)

  const created: string[] = []

  for (const company of sortedCompanies) {
    try {
      const escaped = company.replace(/[%_\\]/g, '\\$&')
      const { data: rawArticles } = await adminClient
        .from('contents')
        .select('id, title, summary_ko, cluster_id, importance_score, collected_at')
        .eq('status', 'published')
        .gte('collected_at', sinceIso)
        .or(`title.ilike.%${escaped}%,summary_ko.ilike.%${escaped}%`)
        .limit(articlesPerCompany * 3)

      const articles = (rawArticles ?? []) as CompanyArticleRow[]

      if (articles.length < minArticles) {
        console.log(`[CompanyInsightGen] company="${company}" 기사 부족(${articles.length}) — 건너뜀`)
        continue
      }

      // 클러스터 대표 우선(cluster_id null) + importance desc
      const sorted = [...articles].sort((a, b) => {
        const aIsRep = a.cluster_id === null ? 0 : 1
        const bIsRep = b.cluster_id === null ? 0 : 1
        if (aIsRep !== bIsRep) return aIsRep - bIsRep
        return (b.importance_score ?? 0) - (a.importance_score ?? 0)
      })
      const picked = sorted.slice(0, articlesPerCompany)

      const raw = await llmComplete('report', COMPANY_SYSTEM_PROMPT, buildCompanyUserPrompt(company, picked))
      if (!raw) {
        console.warn(`[CompanyInsightGen] company="${company}" LLM 응답 없음 — 건너뜀`)
        continue
      }

      const parsed = parseLlmOutput(raw)
      if (!parsed) {
        console.warn(`[CompanyInsightGen] company="${company}" LLM 파싱 실패 — 건너뜀`)
        continue
      }

      // citation 검증 (환각 차단)
      const articleIdSet = new Set(picked.map((a) => a.id))
      const validCitations = parsed.citations.filter((c) => articleIdSet.has(c.content_id))
      const sourceIds = picked.map((a) => a.id)

      const { error: upsertError } = await upsertInsightCard(adminClient, {
        period_start: periodStart,
        period_end: periodEnd,
        scope: 'company',
        topic: company,
        headline: parsed.headline,
        card_headline: parsed.card_headline,
        implication: parsed.implication || null,
        source_content_ids: sourceIds,
        citations: validCitations,
        status: 'draft',
        generated_at: new Date().toISOString(),
      })

      if (upsertError) {
        console.error(`[CompanyInsightGen] company="${company}" upsert 실패:`, upsertError.message)
      } else {
        created.push(company)
        console.log(`[CompanyInsightGen] company="${company}" 생성 완료 (citations=${validCitations.length})`)
      }
    } catch (err) {
      console.error(
        `[CompanyInsightGen] company="${company}" 처리 오류:`,
        err instanceof Error ? err.message : String(err)
      )
    }
  }

  return { created: created.length, companies: created }
}
