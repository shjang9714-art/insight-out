import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { llmComplete } from '@/lib/llm'
import { loadPrompt } from '@/lib/prompts/load-prompt'

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

// 348 패스① — 사실 추출 전용. **해석 금지.**
export const FACTS_SYSTEM_FALLBACK = `당신은 사실 추출기다. 아래는 이번 주 '{area_label}' 영역의 경쟁사 관련 기사다.
기사에서 **사건(event)**만 뽑아 정규화하라. **해석·전망·평가를 절대 쓰지 마라.**
금지 표현: "~로 보인다", "~할 전망", "공격적", "두드러진", "주목된다" 등 일체의 해석어.
출력(JSON 배열만):
[{
  "date": "YYYY-MM-DD",           // 기사에 명시된 사건 발생일. 없으면 기사 날짜.
  "actor": "KT",                   // 사건의 주체(기업·정부 등)
  "event": "1GW급 AIDC 구축 계획 발표, 투자 5조원",   // 무엇을 했는가. 사실만.
  "numbers": {"capex_krw": "5조", "capacity": "1GW"},  // 기사에 나온 수치만. 없으면 생략.
  "content_id": "<기사 id>"        // 반드시 주어진 [id] 중 하나
}]
같은 사건을 다룬 기사가 여럿이면 하나로 합치고 대표 content_id 하나만 쓴다. JSON 배열만 출력.`

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
  body_original: string | null
  matched_groups: string[] | null
  lgu_impact: string | null
  cluster_id: string | null
  importance_score: number | null
  published_at: string | null
  collected_at: string
}

const BODY_FALLBACK_MAX_CHARS = 700

function promptExcerpt(summaryKo: string | null, bodyOriginal: string | null): string {
  const summary = summaryKo?.trim()
  if (summary) return summary
  const body = bodyOriginal
    ?.replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return body ? body.slice(0, BODY_FALLBACK_MAX_CHARS) : ''
}

async function loadWeekContents(
  admin: SupabaseClient,
  sinceIso: string,
  untilIso: string,
): Promise<{ rows: ContentRow[]; error?: string }> {
  const baseQuery = () =>
    admin
      .from('contents')
      .select('id, title, summary_ko, body_original, matched_groups, lgu_impact, cluster_id, importance_score, published_at, collected_at')
      .eq('status', 'published')
      .gte('collected_at', sinceIso)
      .lt('collected_at', untilIso)
      .not('matched_groups', 'is', null)
      .is('deleted_at', null)
      .limit(600)

  const res = await baseQuery()
  if (res.error?.code === '42703') {
    // lgu_impact 컬럼 미적용(241 SQL 전) — 컬럼 제외 후 재시도(graceful)
    const retry = await admin
      .from('contents')
      .select('id, title, summary_ko, body_original, matched_groups, cluster_id, importance_score, published_at, collected_at')
      .eq('status', 'published')
      .gte('collected_at', sinceIso)
      .lt('collected_at', untilIso)
      .not('matched_groups', 'is', null)
      .is('deleted_at', null)
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

function stripJsonFence(raw: string): string {
  return raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim()
}

// 348 패스① 파서
interface RawEvent {
  date: string
  actor: string
  event: string
  numbers?: Record<string, string>
  content_id: string
}

const INTERPRETATION_MARKERS = /(보인다|전망|예상된다|주목|공격적|두드러|활발|긍정적|부정적|시사한다)/

function isDateInWeek(date: string, weekStart: string, weekEnd: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false
  const parsed = new Date(`${date}T00:00:00Z`)
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) return false
  return date >= weekStart && date <= weekEnd
}

function toKstDateString(value: string | null): string | null {
  if (!value) return null
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return null
  return new Date(parsed.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

function parseEventsOutput(
  raw: string,
  validIds: Set<string>,
  publishedDateById: Map<string, string | null>,
  weekStart: string,
  weekEnd: string,
  areaKey: string,
): RawEvent[] {
  try {
    const parsed = JSON.parse(stripJsonFence(raw)) as unknown
    if (!Array.isArray(parsed)) return []
    const out: RawEvent[] = []
    let correctedCount = 0
    let droppedCount = 0
    for (const item of parsed) {
      if (typeof item !== 'object' || item === null) continue
      const o = item as Record<string, unknown>
      if (typeof o.date !== 'string' || typeof o.actor !== 'string' || typeof o.event !== 'string') continue
      if (typeof o.content_id !== 'string' || !validIds.has(o.content_id)) continue
      // 패스①에 해석이 섞이면 패스③(근거 검증)이 무력해진다 — 해석어가 있는 사건은 버린다.
      if (INTERPRETATION_MARKERS.test(o.event)) {
        console.warn('[CompetitorWeekly] 패스① 해석어 감지 — 사건 제외:', o.event)
        continue
      }
      let date = o.date
      if (!isDateInWeek(date, weekStart, weekEnd)) {
        const publishedDate = publishedDateById.get(o.content_id)
        if (!publishedDate || !isDateInWeek(publishedDate, weekStart, weekEnd)) {
          droppedCount += 1
          continue
        }
        date = publishedDate
        correctedCount += 1
      }
      const numbers = (typeof o.numbers === 'object' && o.numbers !== null)
        ? Object.fromEntries(
            Object.entries(o.numbers as Record<string, unknown>)
              .filter(([, v]) => typeof v === 'string') as [string, string][]
          )
        : undefined
      out.push({ date, actor: o.actor, event: o.event, numbers, content_id: o.content_id })
    }
    if (correctedCount > 0 || droppedCount > 0) {
      console.warn(`[CompetitorWeekly] area=${areaKey} date 보정 ${correctedCount}건 / 드롭 ${droppedCount}건`)
    }
    return out
  } catch {
    return []
  }
}

// ─── 프롬프트 빌더 ────────────────────────────────────────────────────────────

function buildAreaUserPrompt(areaLabel: string, articles: ContentRow[]): string {
  const lines = articles
    .map((a) => {
      const hint = a.lgu_impact ? ` (LGU+ 관점 힌트: ${a.lgu_impact})` : ''
      return `[${a.id}] ${a.title}${hint}\n${promptExcerpt(a.summary_ko, a.body_original)}`
    })
    .join('\n\n')
  return `영역: ${areaLabel}\n\n${lines}`
}

interface WeeklyEventOut {
  id: string
  date: string
  actor: string
  event: string
  numbers?: Record<string, string>
  content_id: string
  source_name?: string
}

interface AreaSection {
  area_key: string
  area_label: string
  moves: string
  companies: string[]
  impact: ImpactValue
  implication: string
  citations: { content_id: string; quote: string }[]
  /** 348 패스① 산출 — 패스②(Claude MCP 수동)의 입력이자 근거 참조 키 */
  events: WeeklyEventOut[]
}

// ─── 메인 엔진 ────────────────────────────────────────────────────────────────

export interface GenerateCompetitorWeeklyOptions {
  /** 특정 주 재생성(관리자 수동, YYYY-MM-DD, 월요일 기준). 미지정 시 최근 완결된 주. */
  weekStart?: string
  deadline?: number
  /** @deprecated 348 — 패스②(분석) 없이는 발행하지 않는다. 항상 draft. */
  publish?: boolean
}

export interface GenerateCompetitorWeeklyResult {
  weekStart: string
  weekEnd: string
  status: 'draft' | 'published'
  sections: number
  reason?: string
  /** 398 — 실제로 사건이 뽑혀 섹션이 만들어진 영역만(사건 0건인 영역은 건너뛰므로 매주 다를 수 있다). 성공 시에만 채운다. */
  areas?: { key: string; label: string }[]
}

export async function generateCompetitorWeeklyReport(
  admin: SupabaseClient,
  opts: GenerateCompetitorWeeklyOptions = {},
): Promise<GenerateCompetitorWeeklyResult> {
  const { weekStart, weekEnd } = opts.weekStart
    ? { weekStart: opts.weekStart, weekEnd: addDaysToDateStr(opts.weekStart, 6) }
    : getLastCompletedWeekKst()
  const deadline = opts.deadline

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
    const text = `${c.title} ${promptExcerpt(c.summary_ko, c.body_original)}`.toLowerCase()
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

  // 5. 프롬프트 로드(348 — 패스① 사실 추출 전용)
  const factsPromptTpl = await loadPrompt(admin, 'competitor_weekly_facts', FACTS_SYSTEM_FALLBACK)

  // 6. 영역별 패스① 사실 추출(348) — 해석은 하지 않는다. 해석은 패스②(Claude MCP 수동)에서.
  const sections: AreaSection[] = []
  let evtSeq = 0
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
      const picked = sorted.slice(0, 12)
      const idSet = new Set(picked.map((a) => a.id))
      const publishedDateById = new Map(picked.map((a) => [a.id, toKstDateString(a.published_at)]))

      const system = factsPromptTpl.replace('{area_label}', area.label)
      const raw = await llmComplete('summarize', system, buildAreaUserPrompt(area.label, picked))
      if (!raw) {
        console.warn(`[CompetitorWeekly] area="${area.key}" 패스① 응답 없음 — 건너뜀`)
        continue
      }
      const rawEvents = parseEventsOutput(raw, idSet, publishedDateById, weekStart, weekEnd, area.key)
      if (rawEvents.length === 0) {
        console.warn(`[CompetitorWeekly] area="${area.key}" 패스① 사건 0건 — 건너뜀`)
        continue
      }

      const titleById = new Map(picked.map((a) => [a.id, a.title]))
      const events: WeeklyEventOut[] = rawEvents.map((e) => ({
        id: `evt_${String(++evtSeq).padStart(3, '0')}`,
        date: e.date,
        actor: e.actor,
        event: e.event,
        numbers: e.numbers,
        content_id: e.content_id,
        source_name: titleById.get(e.content_id),
      }))

      const actors = [...new Set(events.map((e) => e.actor))]

      sections.push({
        area_key: area.key,
        area_label: area.label,
        // 레거시 필드 — 분석(패스②) 전에는 사실 나열이 곧 moves 다. 패스② import 시 덮어쓰지 않는다.
        moves: events.map((e) => `${e.date} ${e.actor}: ${e.event}`).join('\n'),
        companies: actors,
        impact: '관망',   // 위기/기회 판정은 해석 → 패스②에서 결정
        implication: '',
        citations: [],
        events,
      })
    } catch (err) {
      console.error(`[CompetitorWeekly] area="${area.key}" 패스① 오류:`, err instanceof Error ? err.message : String(err))
    }
  }

  if (sections.length === 0) {
    return { weekStart, weekEnd, status: 'draft', sections: 0, reason: '영역별 생성 결과 없음(LLM 실패)' }
  }

  // 7. 저장 — 348: 패스①까지만 자동. 분석(패스②) 없이는 발행하지 않는다(항상 draft).
  //    summary/overall_impact/emerging_topics 는 패스② import 에서 채운다.
  const { error: upsertError } = await admin
    .from('competitor_weekly_reports')
    .upsert(
      {
        week_start: weekStart,
        week_end: weekEnd,
        summary: null,
        overall_impact: null,
        emerging_topics: [],
        sections,
        status: 'draft',
        generated_at: new Date().toISOString(),
      },
      { onConflict: 'week_start' },
    )

  if (upsertError) {
    const reason = upsertError.code === '42P01' ? '테이블 미적용(261 SQL 미실행)' : upsertError.message
    console.error('[CompetitorWeekly] upsert 실패:', upsertError.message)
    return { weekStart, weekEnd, status: 'draft', sections: sections.length, reason }
  }

  console.log(`[CompetitorWeekly] ${weekStart}~${weekEnd} 패스① 완료 (영역 ${sections.length}개) — 분석 대기(draft)`)
  const areas = sections.map((s) => ({ key: s.area_key, label: s.area_label }))
  return { weekStart, weekEnd, status: 'draft', sections: sections.length, areas }
}
