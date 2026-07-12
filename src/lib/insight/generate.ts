import 'server-only'

import { llmComplete } from '@/lib/llm'
import { insightAutoPublish, insightCompanyAutoPublish } from '@/lib/insight/auto-publish'
import type { SupabaseClient } from '@supabase/supabase-js'

// ─── 타입 ─────────────────────────────────────────────────────────────────────

interface ContentRow {
  id: string
  title: string
  summary_ko: string | null
  body_original: string | null
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

const BODY_FALLBACK_MAX_CHARS = 700

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
주어진 기사들로 이 주제의 핵심 동향 1줄(headline, 분석가 톤)과 LG U+ B2B(엔터프라이즈/공공/AICC·AIDC 등)에의 시사점(implication)을 쓰라.
추가로 card_headline: 읽고 싶게 만드는 에디토리얼 헤드라인. 구체 수치·주체·변화폭·능동 동사로 끌리게(공백 포함 24자 내외). 단 사실 기반 — 허위·왜곡·근거없는 단정·선정적 낚시 금지, 물음표 남용 금지. 호기심은 구체성과 판돈으로 만든다.
  예시(밋밋 → 끌림, 모두 기사 근거 내에서만): "AI 데이터센터 투자 확대" → "AI 데이터센터, 전력이 발목 잡는다" / "클라우드 보안 강화 추세" → "클라우드 침해 40% 급증, 보안이 먼저다" / "AICC 시장 성장" → "AICC 3년새 2배, 상담원이 사라진다"
implication: 2~3문장으로 구체적으로 쓰라. ①LG U+ B2B에 왜 중요한지 ②기회/리스크를 명시 ③사업·행동 연결점을 제시. 일반론·한 줄 요약 금지, 입력 기사 근거 밖 단정 금지.
근거 없는 주장 금지 — 각 핵심 주장은 입력 기사에서 15단어 이내 인용과 그 content_id를 citations로 제시.
JSON만 출력: {"headline":"","card_headline":"","implication":"","citations":[{"content_id":"","quote":""}]}`

function promptExcerpt(summaryKo: string | null, bodyOriginal: string | null): string {
  const summary = summaryKo?.trim()
  if (summary) return summary
  const body = bodyOriginal
    ?.replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return body ? body.slice(0, BODY_FALLBACK_MAX_CHARS) : ''
}

function buildUserPrompt(topic: string, articles: ContentRow[]): string {
  const lines = articles
    .map((a) => `[${a.id}] ${a.title}\n${promptExcerpt(a.summary_ko, a.body_original)}`)
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
    .select('id, title, summary_ko, body_original, matched_groups, importance_score, cluster_id, collected_at')
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
      const autoPub = insightAutoPublish(validCitations.length, sourceIds.length)

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
        status: autoPub ? 'published' : 'draft',
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
  body_original: string | null
  cluster_id: string | null
  importance_score: number | null
  collected_at: string
}

interface CompanyOptions {
  days?: number
  maxCompanies?: number
  articlesPerCompany?: number
  minArticles?: number
  deadline?: number
}

// 254 — DB(llm_prompts key='company_insight') 미적용/미시드 시 폴백. 253 시드와 동일하게 한글 강제.
const COMPANY_SYSTEM_PROMPT =
  '당신은 LG U+ B2B 시장 인텔리전스 분석가다. 주어진 한 기업 관련 기사들로 그 기업의 **최근 핵심 동향 1줄(headline, 분석가 톤)** 과 **LG U+ B2B 관점 시사점(implication, 경쟁/협력/위협)** 을 쓰라. ' +
  '**반드시 한국어로만 작성한다. 영어 문장·단어 나열 금지(고유명사 제외).** ' +
  '추가로 card_headline: 읽고 싶게 만드는 에디토리얼 헤드라인. 구체 수치·주체·변화폭·능동 동사로 끌리게(공백 포함 24자 내외). 단 사실 기반 — 허위·왜곡·근거없는 단정·선정적 낚시 금지, 물음표 남용 금지. 호기심은 구체성과 판돈으로 만든다. ' +
  '예시(밋밋 → 끌림, 모두 기사 근거 내에서만): "AI 데이터센터 투자 확대" → "AI 데이터센터, 전력이 발목 잡는다" / "클라우드 보안 강화 추세" → "클라우드 침해 40% 급증, 보안이 먼저다" / "AICC 시장 성장" → "AICC 3년새 2배, 상담원이 사라진다". ' +
  'implication: 2~3문장으로 구체적으로 쓰라. ①LG U+ B2B에 왜 중요한지(경쟁/협력/위협 관점) ②기회/리스크를 명시 ③사업·행동 연결점을 제시. 일반론·한 줄 요약 금지, 입력 기사 근거 밖 단정 금지. ' +
  '근거 없는 주장 금지 — 각 핵심 주장은 입력 기사의 15단어 이내 인용과 content_id 를 citations 로. ' +
  'JSON만 출력: {"headline":"","card_headline":"","implication":"","citations":[{"content_id":"","quote":""}]}'

interface CompanySource {
  name: string
  aliases: string[]
}

/**
 * 254 — 회사 생성 대상 로드: curated_companies(253) 우선, 42P01(테이블 미적용) 시
 * 기존 user_watchlist 인기순 경로로 폴백(회귀 없음, 253 적용 전에도 정상 동작).
 */
async function loadCompanySources(
  adminClient: SupabaseClient,
  maxCompanies: number,
): Promise<CompanySource[]> {
  const curatedRes = await adminClient
    .from('curated_companies')
    .select('name, aliases')
    .eq('is_active', true)
    .order('sort_order', { ascending: true })
    .limit(maxCompanies)

  if (!curatedRes.error) {
    return (curatedRes.data ?? []).map((r: { name: string; aliases: string[] | null }) => ({
      name: r.name,
      aliases: r.aliases ?? [],
    }))
  }
  if (curatedRes.error.code !== '42P01') {
    console.warn('[CompanyInsightGen] curated_companies 조회 실패, user_watchlist로 폴백:', curatedRes.error.message)
  }

  // 253 미적용 — 기존 워치리스트 인기순 경로
  const { data: watchRows, error: watchError } = await adminClient
    .from('user_watchlist')
    .select('company')
  if (watchError) {
    console.error('[CompanyInsightGen] 워치리스트 조회 실패:', watchError.message)
    return []
  }

  const countMap = new Map<string, { original: string; count: number }>()
  for (const row of (watchRows ?? []) as { company: string }[]) {
    if (!row.company?.trim()) continue
    const lower = row.company.toLowerCase()
    if (!countMap.has(lower)) countMap.set(lower, { original: row.company.trim(), count: 1 })
    else countMap.get(lower)!.count++
  }

  return [...countMap.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, maxCompanies)
    .map((v) => ({ name: v.original, aliases: [] }))
}

/** 254 — llm_prompts(key='company_insight') DB 로드, 미적용/미시드 시 코드 상수 폴백 */
async function loadCompanyPrompt(adminClient: SupabaseClient): Promise<string> {
  try {
    const { data, error } = await adminClient
      .from('llm_prompts')
      .select('prompt_text')
      .eq('key', 'company_insight')
      .maybeSingle()
    if (!error && data?.prompt_text) return data.prompt_text as string
  } catch {
    // graceful — 코드 상수 폴백
  }
  return COMPANY_SYSTEM_PROMPT
}

function buildCompanyUserPrompt(company: string, articles: CompanyArticleRow[]): string {
  const lines = articles
    .map((a) => `[${a.id}] ${a.title}\n${promptExcerpt(a.summary_ko, a.body_original)}`)
    .join('\n\n')
  return `기업: ${company}\n\n${lines}`
}

export async function generateCompanyInsightCards(
  adminClient: SupabaseClient,
  opts?: CompanyOptions,
): Promise<{ created: number; companies: string[] }> {
  // 258 — build 단계 코퍼스 활용: window 7→90일(COMPANY_INSIGHT_WINDOW_DAYS로 조정 가능),
  // minArticles 1로 완화(1건이라도 있으면 카드). 코퍼스 풍부해지면 축소 검토(후속 259).
  const defaultDays = Number(process.env.COMPANY_INSIGHT_WINDOW_DAYS) || 90
  const days = Math.max(1, opts?.days ?? defaultDays)
  // 254 — curated 41개사 전체 대상(캡 상향), deadline 인지로 시간 관리
  const maxCompanies = Math.max(1, Math.min(opts?.maxCompanies ?? 60, 100))
  const articlesPerCompany = Math.max(1, opts?.articlesPerCompany ?? 12)
  const minArticles = Math.max(1, opts?.minArticles ?? 1)
  const deadline = opts?.deadline

  const companies = await loadCompanySources(adminClient, maxCompanies)
  if (companies.length === 0) {
    console.log('[CompanyInsightGen] 대상 회사 없음 — 생성 건너뜀')
    return { created: 0, companies: [] }
  }

  const systemPrompt = await loadCompanyPrompt(adminClient)

  const periodEnd = kstDateString(0)
  const periodStart = kstDateString(days - 1)
  const sinceIso = kstDateToUtcIso(periodStart)

  const created: string[] = []

  for (const { name: company, aliases } of companies) {
    if (deadline && Date.now() >= deadline) {
      console.log('[CompanyInsightGen] 데드라인 초과 — 남은 회사는 다음 회차에')
      break
    }
    try {
      // 254 — name + aliases[] 다중 매칭(표기 차이 누락 방지)
      const terms = [company, ...aliases]
      const orClause = terms
        .map((t) => t.replace(/[%_\\]/g, '\\$&'))
        .flatMap((escaped) => [`title.ilike.%${escaped}%`, `summary_ko.ilike.%${escaped}%`])
        .join(',')

      const { data: rawArticles } = await adminClient
        .from('contents')
        .select('id, title, summary_ko, body_original, cluster_id, importance_score, collected_at')
        .eq('status', 'published')
        .gte('collected_at', sinceIso)
        .or(orClause)
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

      // 254 — 'summarize' 라우팅(gemini 1순위)으로 한국어 품질 우선
      const raw = await llmComplete('summarize', systemPrompt, buildCompanyUserPrompt(company, picked))
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
      const autoPub = insightCompanyAutoPublish(validCitations.length, sourceIds.length)

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
        status: autoPub ? 'published' : 'draft',
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
