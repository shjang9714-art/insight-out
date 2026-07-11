import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { llmComplete } from '@/lib/llm'

// ─── 사업 영역 축 (261 §2) ────────────────────────────────────────────────────
// matched_groups 에는 keyword_groups.name(한글 라벨)이 저장된다 — kind 슬러그가 아님.
interface AreaDef {
  key: string
  label: string
  matchNames: string[]
}

const AREA_DEFS: AreaDef[] = [
  { key: 'aidc', label: 'AIDC', matchNames: ['AIDC'] },
  { key: 'aicc', label: 'AICC', matchNames: ['AICC'] },
  { key: 'telecom_b2b', label: '통신 B2B', matchNames: ['통신 B2B'] },
  { key: 'security', label: '보안', matchNames: ['사이버보안', 'CCTV·영상보안'] },
  { key: 'cloud_it', label: '클라우드·IT', matchNames: ['IT 동향'] },
  { key: 'mobility', label: '모빌리티', matchNames: ['모빌리티'] },
  { key: 'manufacturing_dx', label: '제조 DX', matchNames: ['제조 DX'] },
]

type ImpactValue = '위기' | '기회' | '관망'
const IMPACT_VALUES: ImpactValue[] = ['위기', '기회', '관망']
function isImpactValue(v: unknown): v is ImpactValue {
  return typeof v === 'string' && (IMPACT_VALUES as string[]).includes(v)
}

// ─── KST 날짜 유틸 (lib/insight/generate.ts 패턴 재사용) ──────────────────────

function kstDateString(offsetDays = 0): string {
  const now = Date.now()
  const kst = new Date(now + 9 * 60 * 60 * 1000)
  const shifted = new Date(kst.getTime() - offsetDays * 24 * 60 * 60 * 1000)
  const y = shifted.getUTCFullYear()
  const m = String(shifted.getUTCMonth() + 1).padStart(2, '0')
  const d = String(shifted.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function kstDateToUtcIso(dateStr: string): string {
  return new Date(`${dateStr}T00:00:00+09:00`).toISOString()
}

function addDaysToDateStr(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/** KST 기준 "가장 최근에 완결된" 월~일 주(현재 진행 중인 주가 아니라 그 직전 주). 크론 게이트(284)의 멱등 확인에도 재사용. */
export function getLastCompletedWeekKst(): { weekStart: string; weekEnd: string } {
  const todayStr = kstDateString(0)
  const today = new Date(`${todayStr}T00:00:00Z`)
  const dow = today.getUTCDay() // 0=Sun..6=Sat
  const daysSinceMonday = (dow + 6) % 7
  const thisMondayStr = addDaysToDateStr(todayStr, -daysSinceMonday)
  const lastMondayStr = addDaysToDateStr(thisMondayStr, -7)
  const lastSundayStr = addDaysToDateStr(lastMondayStr, 6)
  return { weekStart: lastMondayStr, weekEnd: lastSundayStr }
}

// ─── LLM 프롬프트 (llm_prompts DB 우선, 미적용 시 코드 상수 폴백) ─────────────

const AREA_SYSTEM_FALLBACK = `당신은 LG U+ B2B 경쟁 인텔리전스 수석 분석가다. 아래는 이번 주 '{area_label}' 영역의 경쟁사 관련 기사들이다. 이를 종합해 LG U+ 관점의 경쟁 동향을 분석하라.
**반드시 한국어로만 작성한다(고유명사 제외 영어 금지).** 단순 나열('누가 무엇을 했다') 금지 — 흩어진 사실을 하나의 흐름으로 종합하고 해석하라.
출력(JSON):
- moves: 이번 주 이 영역의 핵심 경쟁 움직임 2~4개를 종합 서술. 경쟁사별 사실을 연결해 "무슨 일이 벌어지고 있는지". 서술문에 대괄호로 근거 id를 넣지 말 것 — 근거는 citations 배열로만 제공한다.
- companies: 이 영역에서 움직인 주요 경쟁사명 배열.
- impact: LG U+ 관점 판정 — "위기"|"기회"|"관망" 중 하나. (경쟁사 약진·잠식=위기, 경쟁사 부진·틈=기회, 중립·불명확=관망)
- implication: LG U+ B2B가 취해야 할 대응·주목점 2~3문장. 근거 밖 단정·과장 금지.
- citations: 핵심 주장별 15단어 이내 인용 + content_id. 3건 이상 권장.
JSON만 출력.`

const SUMMARY_SYSTEM_FALLBACK = `당신은 LG U+ B2B 경쟁 인텔리전스 수석 분석가다. 아래는 이번 주 사업영역별 경쟁 동향 분석 결과다. 종합해 주간 리포트 헤더를 작성하라. 한국어만.
출력(JSON):
- week_summary: 이번 주 경쟁 구도를 한 줄로(공백 포함 24자 내외, 구체적·사실 기반).
- emerging_topics: 이번 주 새로 부상하거나 주목할 주제 2~3개(배열, 각 10자 내외).
- overall_impact: 종합 판정 "위기"|"기회"|"관망" 중 하나.
JSON만 출력.`

async function loadPrompt(admin: SupabaseClient, key: string, fallback: string): Promise<string> {
  try {
    const { data, error } = await admin
      .from('llm_prompts')
      .select('prompt_text')
      .eq('key', key)
      .maybeSingle()
    if (!error && data?.prompt_text) return data.prompt_text as string
  } catch {
    // graceful — 코드 상수 폴백
  }
  return fallback
}

// ─── 경쟁사 목록 (253 curated_companies 재사용) ───────────────────────────────

interface CompetitorCompany {
  name: string
  aliases: string[]
}

async function loadCompetitorCompanies(admin: SupabaseClient): Promise<CompetitorCompany[]> {
  const { data, error } = await admin
    .from('curated_companies')
    .select('name, aliases')
    .eq('is_active', true)
    .eq('is_competitor', true)

  if (error) {
    console.warn('[CompetitorWeekly] curated_companies 조회 실패(253 미적용 가능):', error.message)
    return []
  }
  return (data ?? []).map((r: { name: string; aliases: string[] | null }) => ({
    name: r.name,
    aliases: r.aliases ?? [],
  }))
}

// ─── 기사 조회 ────────────────────────────────────────────────────────────────

interface ContentRow {
  id: string
  title: string
  summary_ko: string | null
  matched_groups: string[] | null
  lgu_impact: string | null
  cluster_id: string | null
  importance_score: number | null
  collected_at: string
}

async function loadWeekContents(
  admin: SupabaseClient,
  sinceIso: string,
  untilIso: string,
): Promise<{ rows: ContentRow[]; error?: string }> {
  const baseQuery = () =>
    admin
      .from('contents')
      .select('id, title, summary_ko, matched_groups, lgu_impact, cluster_id, importance_score, collected_at')
      .eq('status', 'published')
      .gte('collected_at', sinceIso)
      .lt('collected_at', untilIso)
      .not('matched_groups', 'is', null)
      .limit(600)

  const res = await baseQuery()
  if (res.error?.code === '42703') {
    // lgu_impact 컬럼 미적용(241 SQL 전) — 컬럼 제외 후 재시도(graceful)
    const retry = await admin
      .from('contents')
      .select('id, title, summary_ko, matched_groups, cluster_id, importance_score, collected_at')
      .eq('status', 'published')
      .gte('collected_at', sinceIso)
      .lt('collected_at', untilIso)
      .not('matched_groups', 'is', null)
      .limit(600)
    if (retry.error) return { rows: [], error: retry.error.message }
    return {
      rows: (retry.data ?? []).map((r: Omit<ContentRow, 'lgu_impact'>) => ({ ...r, lgu_impact: null })),
    }
  }
  if (res.error) return { rows: [], error: res.error.message }
  return { rows: (res.data ?? []) as ContentRow[] }
}

// ─── LLM 출력 파싱 ────────────────────────────────────────────────────────────

interface AreaLlmOutput {
  moves: string
  companies: string[]
  impact: ImpactValue
  implication: string
  citations: { content_id: string; quote: string }[]
}

function stripJsonFence(raw: string): string {
  return raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim()
}

function parseAreaOutput(raw: string): AreaLlmOutput | null {
  try {
    const parsed = JSON.parse(stripJsonFence(raw)) as unknown
    if (typeof parsed !== 'object' || parsed === null) return null
    const obj = parsed as Record<string, unknown>
    if (typeof obj.moves !== 'string' || !obj.moves.trim()) return null
    if (!isImpactValue(obj.impact)) return null
    const companies = Array.isArray(obj.companies)
      ? (obj.companies as unknown[]).filter((c): c is string => typeof c === 'string')
      : []
    const citations = Array.isArray(obj.citations)
      ? (obj.citations as unknown[]).filter(
          (c): c is { content_id: string; quote: string } =>
            typeof c === 'object' &&
            c !== null &&
            typeof (c as Record<string, unknown>).content_id === 'string' &&
            typeof (c as Record<string, unknown>).quote === 'string'
        )
      : []
    return {
      moves: obj.moves,
      companies,
      impact: obj.impact,
      implication: typeof obj.implication === 'string' ? obj.implication : '',
      citations,
    }
  } catch {
    return null
  }
}

interface SummaryLlmOutput {
  week_summary: string
  emerging_topics: string[]
  overall_impact: ImpactValue
}

function parseSummaryOutput(raw: string): SummaryLlmOutput | null {
  try {
    const parsed = JSON.parse(stripJsonFence(raw)) as unknown
    if (typeof parsed !== 'object' || parsed === null) return null
    const obj = parsed as Record<string, unknown>
    if (!isImpactValue(obj.overall_impact)) return null
    const emergingTopics = Array.isArray(obj.emerging_topics)
      ? (obj.emerging_topics as unknown[]).filter((t): t is string => typeof t === 'string')
      : []
    return {
      week_summary: typeof obj.week_summary === 'string' ? obj.week_summary : '',
      emerging_topics: emergingTopics,
      overall_impact: obj.overall_impact,
    }
  } catch {
    return null
  }
}

// ─── 프롬프트 빌더 ────────────────────────────────────────────────────────────

function buildAreaUserPrompt(areaLabel: string, articles: ContentRow[]): string {
  const lines = articles
    .map((a) => {
      const hint = a.lgu_impact ? ` (LGU+ 관점 힌트: ${a.lgu_impact})` : ''
      return `[${a.id}] ${a.title}${hint}\n${a.summary_ko ?? ''}`
    })
    .join('\n\n')
  return `영역: ${areaLabel}\n\n${lines}`
}

interface AreaSection {
  area_key: string
  area_label: string
  moves: string
  companies: string[]
  impact: ImpactValue
  implication: string
  citations: { content_id: string; quote: string }[]
}

function buildSummaryUserPrompt(sections: AreaSection[]): string {
  return sections
    .map((s) => `[${s.area_label}] impact=${s.impact}\n${s.moves}`)
    .join('\n\n')
}

function deriveOverallImpact(sections: AreaSection[]): ImpactValue {
  const counts: Record<ImpactValue, number> = { 위기: 0, 기회: 0, 관망: 0 }
  for (const s of sections) counts[s.impact]++
  let best: ImpactValue = '관망'
  let bestCount = -1
  for (const v of IMPACT_VALUES) {
    if (counts[v] > bestCount) { best = v; bestCount = counts[v] }
  }
  return best
}

// ─── 메인 엔진 ────────────────────────────────────────────────────────────────

export interface GenerateCompetitorWeeklyOptions {
  /** 특정 주 재생성(관리자 수동, YYYY-MM-DD, 월요일 기준). 미지정 시 최근 완결된 주. */
  weekStart?: string
  deadline?: number
  /** false 면 근거가 있어도 draft 로 저장(284 — 크론 게이트의 auto_publish=false 대응). 기본 true(기존 동작). */
  publish?: boolean
}

export interface GenerateCompetitorWeeklyResult {
  weekStart: string
  weekEnd: string
  status: 'draft' | 'published'
  sections: number
  reason?: string
}

export async function generateCompetitorWeeklyReport(
  admin: SupabaseClient,
  opts: GenerateCompetitorWeeklyOptions = {},
): Promise<GenerateCompetitorWeeklyResult> {
  const { weekStart, weekEnd } = opts.weekStart
    ? { weekStart: opts.weekStart, weekEnd: addDaysToDateStr(opts.weekStart, 6) }
    : getLastCompletedWeekKst()
  const deadline = opts.deadline
  const publish = opts.publish ?? true

  // 1. 경쟁사 목록 (253)
  const competitors = await loadCompetitorCompanies(admin)
  if (competitors.length === 0) {
    return { weekStart, weekEnd, status: 'draft', sections: 0, reason: '경쟁사 목록 없음(253 미적용 또는 is_competitor 미지정)' }
  }
  const compTerms = [...new Set(
    competitors.flatMap((c) => [c.name, ...c.aliases])
      .map((t) => t.trim().toLowerCase())
      .filter((t) => t.length >= 2)
  )]

  // 2. 이번 주 기사(우리가 검색) — 사업영역 태깅된 published 기사만
  const sinceIso = kstDateToUtcIso(weekStart)
  const untilIso = kstDateToUtcIso(addDaysToDateStr(weekEnd, 1))
  const { rows: contents, error: contentsError } = await loadWeekContents(admin, sinceIso, untilIso)
  if (contentsError) {
    return { weekStart, weekEnd, status: 'draft', sections: 0, reason: contentsError }
  }

  // 3. 경쟁사 관련 기사만 필터(우리가 판정 — LLM 아님)
  const competitorRows = contents.filter((c) => {
    const text = `${c.title} ${c.summary_ko ?? ''}`.toLowerCase()
    return compTerms.some((t) => text.includes(t))
  })
  if (competitorRows.length === 0) {
    return { weekStart, weekEnd, status: 'draft', sections: 0, reason: '이번 주 경쟁사 관련 기사 없음' }
  }

  // 4. 사업영역 버킷팅(우리가 분류 — matched_groups 기반, LLM 아님)
  const bucket = new Map<string, ContentRow[]>()
  for (const area of AREA_DEFS) {
    const rows = competitorRows.filter((c) => (c.matched_groups ?? []).some((g) => area.matchNames.includes(g)))
    if (rows.length > 0) bucket.set(area.key, rows)
  }
  if (bucket.size === 0) {
    return { weekStart, weekEnd, status: 'draft', sections: 0, reason: '사업영역 매칭 경쟁사 기사 없음' }
  }

  // 5. 프롬프트 로드
  const areaPromptTpl = await loadPrompt(admin, 'competitor_weekly_area', AREA_SYSTEM_FALLBACK)
  const summaryPromptTpl = await loadPrompt(admin, 'competitor_weekly_summary', SUMMARY_SYSTEM_FALLBACK)

  // 6. 영역별 LLM 종합
  const sections: AreaSection[] = []
  for (const area of AREA_DEFS) {
    const rows = bucket.get(area.key)
    if (!rows) continue
    if (deadline && Date.now() >= deadline) {
      console.log('[CompetitorWeekly] 데드라인 초과 — 남은 영역은 다음 회차에')
      break
    }
    try {
      const sorted = [...rows].sort((a, b) => {
        const aIsRep = a.cluster_id === null ? 0 : 1
        const bIsRep = b.cluster_id === null ? 0 : 1
        if (aIsRep !== bIsRep) return aIsRep - bIsRep
        return (b.importance_score ?? 0) - (a.importance_score ?? 0)
      })
      const picked = sorted.slice(0, 10)

      const system = areaPromptTpl.replace('{area_label}', area.label)
      const raw = await llmComplete('summarize', system, buildAreaUserPrompt(area.label, picked))
      if (!raw) {
        console.warn(`[CompetitorWeekly] area="${area.key}" LLM 응답 없음 — 건너뜀`)
        continue
      }
      const parsed = parseAreaOutput(raw)
      if (!parsed) {
        console.warn(`[CompetitorWeekly] area="${area.key}" LLM 파싱 실패 — 건너뜀`)
        continue
      }

      const idSet = new Set(picked.map((a) => a.id))
      const validCitations = parsed.citations.filter((c) => idSet.has(c.content_id))

      sections.push({
        area_key: area.key,
        area_label: area.label,
        moves: parsed.moves,
        companies: parsed.companies,
        impact: parsed.impact,
        implication: parsed.implication,
        citations: validCitations,
      })
    } catch (err) {
      console.error(`[CompetitorWeekly] area="${area.key}" 처리 오류:`, err instanceof Error ? err.message : String(err))
    }
  }

  if (sections.length === 0) {
    return { weekStart, weekEnd, status: 'draft', sections: 0, reason: '영역별 생성 결과 없음(LLM 실패)' }
  }

  // 7. 주간 헤더 LLM 종합 (실패해도 sections 기반 폴백으로 계속 진행)
  let summaryOut: SummaryLlmOutput | null = null
  if (!deadline || Date.now() < deadline) {
    try {
      const raw = await llmComplete('summarize', summaryPromptTpl, buildSummaryUserPrompt(sections))
      summaryOut = raw ? parseSummaryOutput(raw) : null
    } catch (err) {
      console.error('[CompetitorWeekly] 주간 헤더 생성 오류:', err instanceof Error ? err.message : String(err))
    }
  }

  const overallImpact = summaryOut?.overall_impact ?? deriveOverallImpact(sections)
  // 근거(sections) 있고 publish 옵션이 true(기본)면 발행 — §1 자동발행 정책. false면 draft(284 크론 게이트).
  const status: 'draft' | 'published' = (sections.length > 0 && publish) ? 'published' : 'draft'

  // 8. 저장(멱등 upsert, week_start 유니크)
  const { error: upsertError } = await admin
    .from('competitor_weekly_reports')
    .upsert(
      {
        week_start: weekStart,
        week_end: weekEnd,
        summary: summaryOut?.week_summary || null,
        overall_impact: overallImpact,
        emerging_topics: summaryOut?.emerging_topics ?? [],
        sections,
        status,
        generated_at: new Date().toISOString(),
      },
      { onConflict: 'week_start' },
    )

  if (upsertError) {
    const reason = upsertError.code === '42P01' ? '테이블 미적용(261 SQL 미실행)' : upsertError.message
    console.error('[CompetitorWeekly] upsert 실패:', upsertError.message)
    return { weekStart, weekEnd, status: 'draft', sections: sections.length, reason }
  }

  console.log(`[CompetitorWeekly] ${weekStart}~${weekEnd} 생성 완료 (영역 ${sections.length}개)`)
  return { weekStart, weekEnd, status, sections: sections.length }
}
