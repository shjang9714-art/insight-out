import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { llmComplete } from '@/lib/llm'
import type { AiReportType } from '@/lib/types'

export interface GenerateStrategyParams {
  /** 있으면 재생성(update), 없으면 신규 생성(insert) */
  reportId?: string
  /** 생성을 트리거한 관리자 — ai_reports.user_id(not null) 소유자로 기록 */
  userId: string
  type: AiReportType
  topic: string
  title?: string
  sourceIssueIds?: string[]
  contentIds?: string[]
  promptOverride?: string
}

export interface GenerateStrategyResult {
  reportId: string
  status: 'completed' | 'failed'
  error?: string
  /** false 면 SQL 274 미적용 — body_md 레거시 경로로 폴백 저장됨 */
  columnsApplied: boolean
  /** 근거(ai_report_sources)로 실제 적재된 행 수(276). SQL 276 미적용/실패 시 0(graceful). */
  sourcesSaved: number
}

// llm_prompts(key='strategy_report') 미적용/조회 실패 시 코드 상수 폴백 (SQL 274 시드와 동일 문구)
export const STRATEGY_SYSTEM_FALLBACK =
  '당신은 LG U+ B2B 시장정보 수석 애널리스트다. 주어진 주제와 참고 자료(이슈·기사 요약)를 바탕으로 임원 대상 전략보고서를 작성한다.\n\n' +
  '[출력 형식]\n' +
  '- 반드시 한국어. 전체를 유효한 HTML 조각으로 출력(마크다운·코드펜스 금지). <h2>/<h3>/<p>/<ul>/<li>/<table> 등 시맨틱 태그만 사용, style 속성·script·iframe 금지.\n' +
  '- 구조: <h2>핵심 요약</h2> → <h2>배경/맥락</h2> → <h2>핵심 분석</h2>(근거·데이터 포함) → <h2>시사점(LG U+ 관점)</h2> → <h2>전망·제언</h2>.\n' +
  '- 맨 앞에 한 줄로 카드용 요약을 넣되, 다음 형식으로 시작: <!--SUMMARY: 2~3문장 요약 --> 그 뒤에 본문 HTML.\n\n' +
  '[내용 원칙]\n' +
  '- 과장·추측 금지, 참고 자료 근거 기반. LG U+ B2B(AIDC·AICC·통신B2B·보안·클라우드) 관점의 시사점을 명확히.\n' +
  '- 숫자·고유명사는 자료에 있는 것만. 불확실하면 단정하지 말 것.\n' +
  '- 임원이 3분 내 핵심을 얻도록 간결·구조적으로.'

async function loadStrategyPrompt(admin: SupabaseClient): Promise<string> {
  try {
    const { data, error } = await admin
      .from('llm_prompts')
      .select('prompt_text')
      .eq('key', 'strategy_report')
      .maybeSingle()
    if (!error && data?.prompt_text) return data.prompt_text as string
  } catch {
    // graceful — 코드 상수 폴백
  }
  return STRATEGY_SYSTEM_FALLBACK
}

async function collectContext(
  admin: SupabaseClient,
  sourceIssueIds: string[],
  contentIds: string[],
): Promise<string> {
  const parts: string[] = []

  if (sourceIssueIds.length > 0) {
    const { data } = await admin
      .from('issues')
      .select('title, summary')
      .in('id', sourceIssueIds)
    for (const row of (data ?? []) as { title: string; summary: string | null }[]) {
      parts.push(`[이슈] ${row.title}${row.summary ? `\n${row.summary}` : ''}`)
    }
  }

  if (contentIds.length > 0) {
    const { data } = await admin
      .from('contents')
      .select('title, summary_ko')
      .in('id', contentIds)
    for (const row of (data ?? []) as { title: string; summary_ko: string | null }[]) {
      parts.push(`[콘텐츠] ${row.title}${row.summary_ko ? `\n${row.summary_ko}` : ''}`)
    }
  }

  return parts.join('\n\n')
}

const SUMMARY_COMMENT_PATTERN = /^\s*<!--\s*SUMMARY:\s*([\s\S]*?)-->/i
const SUMMARY_FALLBACK_MAXCHARS = 200

/** 선두 <!--SUMMARY: … --> 파싱, 없으면 첫 <p> 텍스트로 대체 추출 */
function extractSummaryAndBody(raw: string): { summary: string; bodyHtml: string } {
  const match = raw.match(SUMMARY_COMMENT_PATTERN)
  if (match) {
    return { summary: match[1].trim(), bodyHtml: raw.slice(match[0].length).trim() }
  }
  const pMatch = raw.match(/<p[^>]*>([\s\S]*?)<\/p>/i)
  const plain = pMatch ? pMatch[1].replace(/<[^>]+>/g, '').trim() : ''
  const summary = plain.length > SUMMARY_FALLBACK_MAXCHARS
    ? `${plain.slice(0, SUMMARY_FALLBACK_MAXCHARS)}…`
    : plain
  return { summary, bodyHtml: raw.trim() }
}

/** 서버측 1차 정제(코드펜스·script·iframe·on*=·style 제거) — 렌더 시 2차 sanitize(275)는 별건. */
function sanitizeHtml(html: string): string {
  return html
    .replace(/```html?/gi, '')
    .replace(/```/g, '')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<iframe\b[^>]*>[\s\S]*?<\/iframe>/gi, '')
    .replace(/\son\w+\s*=\s*"[^"]*"/gi, '')
    .replace(/\son\w+\s*=\s*'[^']*'/gi, '')
    .replace(/\sstyle\s*=\s*"[^"]*"/gi, '')
    .replace(/\sstyle\s*=\s*'[^']*'/gi, '')
    .trim()
}

const UNDEFINED_COLUMN = '42703'

async function upsertReport(
  admin: SupabaseClient,
  reportId: string | undefined,
  userId: string,
  type: AiReportType,
  topic: string,
  fields: Record<string, unknown>,
): Promise<{ id: string }> {
  if (reportId) {
    const { data, error } = await admin
      .from('ai_reports')
      .update(fields)
      .eq('id', reportId)
      .select('id')
      .single()
    if (error) throw error
    return data
  }
  const { data, error } = await admin
    .from('ai_reports')
    .insert({ user_id: userId, type, prompt: topic, ...fields })
    .select('id')
    .single()
  if (error) throw error
  return data
}

/** 신규 컬럼(274)으로 저장 시도 → 42703(컬럼 미적용)이면 레거시(body_md) 경로로 폴백 */
async function saveWithFallback(
  admin: SupabaseClient,
  reportId: string | undefined,
  userId: string,
  type: AiReportType,
  topic: string,
  fullFields: Record<string, unknown>,
  legacyFields: Record<string, unknown>,
): Promise<{ id: string; columnsApplied: boolean }> {
  try {
    const row = await upsertReport(admin, reportId, userId, type, topic, fullFields)
    return { id: row.id, columnsApplied: true }
  } catch (e) {
    const code = (e as { code?: string } | null)?.code
    if (code !== UNDEFINED_COLUMN) throw e
  }
  const row = await upsertReport(admin, reportId, userId, type, topic, legacyFields)
  return { id: row.id, columnsApplied: false }
}

/**
 * 근거(출처) 적재(276) — 전달된 이슈/콘텐츠를 ai_report_sources 에 반영한다.
 * 재생성 시 기존 행을 먼저 삭제 후 재적재(중복 방지, 유니크 인덱스 정합).
 * SQL 276(issue_id 컬럼·CHECK) 미적용이어도 보고서 생성 자체는 깨지지 않게 graceful.
 */
async function saveReportSources(
  admin: SupabaseClient,
  reportId: string,
  sourceIssueIds: string[],
  contentIds: string[],
): Promise<number> {
  try {
    await admin.from('ai_report_sources').delete().eq('ai_report_id', reportId)

    const rows = [
      ...contentIds.map((content_id) => ({ ai_report_id: reportId, content_id })),
      ...sourceIssueIds.map((issue_id) => ({ ai_report_id: reportId, issue_id })),
    ]
    if (rows.length === 0) return 0

    const { error } = await admin.from('ai_report_sources').insert(rows)
    if (error) {
      console.error('[generate-strategy] 근거 적재 실패:', error.message)
      return 0
    }
    return rows.length
  } catch (e) {
    console.error('[generate-strategy] 근거 적재 실패:', e)
    return 0
  }
}

/** 전략보고서(HTML) 생성 — 이슈/콘텐츠 컨텍스트 수집 → llmComplete('report', …) → ai_reports 저장(274). */
export async function generateStrategyReport(
  admin: SupabaseClient,
  params: GenerateStrategyParams,
): Promise<GenerateStrategyResult> {
  const {
    reportId, userId, type, topic, title,
    sourceIssueIds = [], contentIds = [], promptOverride,
  } = params

  const reportTitle = title?.trim() || topic

  const systemPrompt = promptOverride?.trim() || await loadStrategyPrompt(admin)
  const context = await collectContext(admin, sourceIssueIds, contentIds)
  const userPrompt = [
    `주제: ${topic}`,
    title ? `제목(참고): ${title}` : null,
    context ? `참고 자료:\n${context}` : null,
  ].filter(Boolean).join('\n\n')

  let raw: string | null
  try {
    raw = await llmComplete('report', systemPrompt, userPrompt)
  } catch (e) {
    console.error('[generate-strategy] llmComplete 실패:', e)
    raw = null
  }

  if (!raw) {
    const reason = 'LLM 생성 실패(무료 한도 소진 또는 프로바이더 오류)'
    try {
      const { id, columnsApplied } = await saveWithFallback(
        admin, reportId, userId, type, topic,
        { title: reportTitle, topic, status: 'failed', error_message: reason },
        { title: reportTitle, status: 'failed', error_message: reason },
      )
      const sourcesSaved = await saveReportSources(admin, id, sourceIssueIds, contentIds)
      return { reportId: id, status: 'failed', error: reason, columnsApplied, sourcesSaved }
    } catch (e) {
      console.error('[generate-strategy] 실패 상태 저장 실패:', e)
      return { reportId: reportId ?? '', status: 'failed', error: reason, columnsApplied: false, sourcesSaved: 0 }
    }
  }

  const cleaned = sanitizeHtml(raw)
  const { summary, bodyHtml } = extractSummaryAndBody(cleaned)

  try {
    const { id, columnsApplied } = await saveWithFallback(
      admin, reportId, userId, type, topic,
      { title: reportTitle, topic, body_html: bodyHtml, summary, status: 'completed', error_message: null },
      { title: reportTitle, status: 'completed', body_md: bodyHtml, error_message: null },
    )
    const sourcesSaved = await saveReportSources(admin, id, sourceIssueIds, contentIds)
    return { reportId: id, status: 'completed', columnsApplied, sourcesSaved }
  } catch (e) {
    console.error('[generate-strategy] 저장 실패:', e)
    return { reportId: reportId ?? '', status: 'failed', error: '보고서 저장에 실패했습니다.', columnsApplied: false, sourcesSaved: 0 }
  }
}
