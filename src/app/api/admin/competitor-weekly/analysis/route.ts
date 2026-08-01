import { verifyAdminRequest } from '@/lib/admin/verify-admin-request'
import { NextRequest, NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { FRAME_SPEC, LGU_CONTEXT } from '@/lib/competitor-weekly/frame-spec'
import { verifyAnalysis, isImpactValue, type AnalysisInput, type VerifyReport } from '@/lib/competitor-weekly/verify'
import type { CompetitorWeeklySection } from '@/lib/competitor-weekly/query'
import { loadPrompt } from '@/lib/prompts/load-prompt'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * 348 — 패스②(Claude MCP 수동) 경로.
 * GET  : 분석 컨텍스트(사건 목록 + 프레임 스펙) 내보내기 → 어드민에서 복사 → Claude 에 붙여넣기
 * POST : Claude 결과 JSON 가져오기 → 스키마 검증 → 패스③ 근거 검증 → draft 저장
 */


interface ReportRow {
  week_start: string
  week_end: string
  sections: CompetitorWeeklySection[]
  status: string
}

async function loadReport(admin: SupabaseClient, weekStart: string): Promise<ReportRow | null> {
  const { data } = await admin
    .from('competitor_weekly_reports')
    .select('week_start, week_end, sections, status')
    .eq('week_start', weekStart)
    .maybeSingle()
  return (data as ReportRow | null) ?? null
}

// ─── GET: 분석 컨텍스트 내보내기 ──────────────────────────────────────────────

export async function GET(request: NextRequest) {
  const gate = await verifyAdminRequest()
  if (!gate.ok) return gate.response

  const weekStart = request.nextUrl.searchParams.get('week')
  if (!weekStart) {
    return NextResponse.json({ error: 'week 파라미터가 필요합니다.' }, { status: 400 })
  }

  const report = await loadReport(gate.admin, weekStart)
  if (!report) {
    return NextResponse.json({ error: '해당 주 리포트가 없습니다. 먼저 사실 추출(생성)을 실행하세요.' }, { status: 404 })
  }

  const areas = (report.sections ?? []).map(s => ({
    area_key: s.area_key,
    area_label: s.area_label,
    events: (s.events ?? []).map(e => ({
      id: e.id,
      date: e.date,
      actor: e.actor,
      event: e.event,
      ...(e.numbers ? { numbers: e.numbers } : {}),
      source: e.source_name ?? '',
    })),
  }))

  const eventCount = areas.reduce((n, a) => n + a.events.length, 0)

  const promptAdmin = gate.admin
  const [frame, lguContext] = await Promise.all([
    loadPrompt(promptAdmin, 'competitor_weekly_frame', FRAME_SPEC),
    loadPrompt(promptAdmin, 'competitor_weekly_lgu_context', LGU_CONTEXT),
  ])
  const frameSpec = [frame, '', lguContext].join('\n')

  // Claude 에 그대로 붙여넣을 수 있는 단일 텍스트
  const prompt = [
    frameSpec,
    '',
    `[주간] ${report.week_start} ~ ${report.week_end}`,
    '',
    '[사건 목록]',
    JSON.stringify({ areas }, null, 2),
  ].join('\n')

  return NextResponse.json({
    week_start: report.week_start,
    week_end: report.week_end,
    areas,
    frame_spec: frameSpec,
    // 기존 어드민 복사 UI가 한 번에 사용할 수 있도록 조합 문자열도 유지한다.
    weekStart: report.week_start,
    weekEnd: report.week_end,
    areaCount: areas.length,
    eventCount,
    prompt,
  })
}

// ─── POST: 분석 결과 가져오기 ────────────────────────────────────────────────

interface ImportBody {
  weekStart?: unknown
  analysis?: unknown
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(item => typeof item === 'string')
}

function validateEvidenceItems(value: unknown, path: string, fields: string[]): string | null {
  if (!Array.isArray(value)) return `${path}는 배열이어야 합니다.`
  for (const [index, item] of value.entries()) {
    if (!isRecord(item)) return `${path}[${index}]는 객체여야 합니다.`
    for (const field of fields) {
      if (typeof item[field] !== 'string' || !item[field].trim()) {
        return `${path}[${index}].${field}는 비어 있지 않은 문자열이어야 합니다.`
      }
    }
    if (!isStringArray(item.evidence) || item.evidence.length === 0) {
      return `${path}[${index}].evidence는 비어 있지 않은 문자열 배열이어야 합니다.`
    }
  }
  return null
}

function validateAnalysisPayload(analysis: Record<string, unknown>): string | null {
  if (typeof analysis.summary !== 'string' || !analysis.summary.trim()) {
    return 'summary는 비어 있지 않은 문자열이어야 합니다.'
  }
  if (!isImpactValue(analysis.overall_impact)) {
    return 'overall_impact는 위기·기회·관망 중 하나여야 합니다.'
  }
  if (!isStringArray(analysis.emerging_topics)) {
    return 'emerging_topics는 문자열 배열이어야 합니다.'
  }
  if (!Array.isArray(analysis.areas) || analysis.areas.length === 0) {
    return 'areas는 비어 있지 않은 배열이어야 합니다.'
  }

  for (const [index, area] of analysis.areas.entries()) {
    const path = `areas[${index}]`
    if (!isRecord(area)) return `${path}는 객체여야 합니다.`
    if (typeof area.area_key !== 'string' || !area.area_key.trim()) {
      return `${path}.area_key는 비어 있지 않은 문자열이어야 합니다.`
    }
    if (!isImpactValue(area.impact)) return `${path}.impact 값이 올바르지 않습니다.`
    if (typeof area.overview !== 'string' || !area.overview.trim()) {
      return `${path}.overview는 비어 있지 않은 문자열이어야 합니다.`
    }

    const statusError = validateEvidenceItems(area.status_points, `${path}.status_points`, ['thesis', 'detail'])
    if (statusError) return statusError
    const intentError = validateEvidenceItems(area.intents, `${path}.intents`, ['actor', 'seeking', 'reading'])
    if (intentError) return intentError
    if (!isStringArray(area.conflict_areas)) return `${path}.conflict_areas는 문자열 배열이어야 합니다.`

    if (!isRecord(area.asymmetry)) return `${path}.asymmetry는 객체여야 합니다.`
    for (const field of ['theirs', 'ours']) {
      if (typeof area.asymmetry[field] !== 'string' || !area.asymmetry[field].trim()) {
        return `${path}.asymmetry.${field}는 비어 있지 않은 문자열이어야 합니다.`
      }
    }
    if (!isStringArray(area.asymmetry.evidence) || area.asymmetry.evidence.length === 0) {
      return `${path}.asymmetry.evidence는 비어 있지 않은 문자열 배열이어야 합니다.`
    }

    if (!Array.isArray(area.options)) return `${path}.options는 배열이어야 합니다.`
    for (const [optionIndex, option] of area.options.entries()) {
      if (!isRecord(option)) return `${path}.options[${optionIndex}]는 객체여야 합니다.`
      if (typeof option.action !== 'string' || !option.action.trim()) {
        return `${path}.options[${optionIndex}].action은 비어 있지 않은 문자열이어야 합니다.`
      }
      if (typeof option.rationale !== 'string' || !option.rationale.trim()) {
        return `${path}.options[${optionIndex}].rationale은 비어 있지 않은 문자열이어야 합니다.`
      }
      if (option.cost !== undefined && option.cost !== '상' && option.cost !== '중' && option.cost !== '하') {
        return `${path}.options[${optionIndex}].cost 값이 올바르지 않습니다.`
      }
    }

    if (!Array.isArray(area.watch_metrics)) return `${path}.watch_metrics는 배열이어야 합니다.`
    for (const [metricIndex, metric] of area.watch_metrics.entries()) {
      if (!isRecord(metric)) return `${path}.watch_metrics[${metricIndex}]는 객체여야 합니다.`
      if (typeof metric.metric !== 'string' || !metric.metric.trim()) {
        return `${path}.watch_metrics[${metricIndex}].metric은 비어 있지 않은 문자열이어야 합니다.`
      }
      if (typeof metric.if_then !== 'string' || !metric.if_then.trim()) {
        return `${path}.watch_metrics[${metricIndex}].if_then은 비어 있지 않은 문자열이어야 합니다.`
      }
      if (metric.due !== undefined && typeof metric.due !== 'string') {
        return `${path}.watch_metrics[${metricIndex}].due는 문자열이어야 합니다.`
      }
    }
  }

  return null
}

export async function POST(request: NextRequest) {
  const gate = await verifyAdminRequest()
  if (!gate.ok) return gate.response

  let body: ImportBody
  try {
    body = await request.json() as ImportBody
  } catch {
    return NextResponse.json({ error: '요청 본문이 JSON이 아닙니다.' }, { status: 400 })
  }

  const weekStart = typeof body.weekStart === 'string' ? body.weekStart : ''
  if (!weekStart) return NextResponse.json({ error: 'weekStart가 필요합니다.' }, { status: 400 })

  // analysis 는 객체 또는 Claude 가 준 문자열(JSON) 둘 다 허용 — 붙여넣기 실수 방지
  let analysis: Record<string, unknown>
  try {
    const raw = body.analysis
    const parsed = typeof raw === 'string'
      ? JSON.parse(raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim())
      : raw
    if (typeof parsed !== 'object' || parsed === null) throw new Error('object 아님')
    analysis = parsed as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: '분석 결과가 올바른 JSON이 아닙니다.' }, { status: 400 })
  }

  const schemaError = validateAnalysisPayload(analysis)
  if (schemaError) {
    return NextResponse.json({ error: `분석 결과 스키마 오류: ${schemaError}` }, { status: 400 })
  }

  const report = await loadReport(gate.admin, weekStart)
  if (!report) return NextResponse.json({ error: '해당 주 리포트가 없습니다.' }, { status: 404 })

  const areasInput = analysis.areas as AnalysisInput[]

  const byKey = new Map(areasInput.map(a => [a.area_key, a]))
  const unknownKeys = areasInput
    .map(a => a.area_key)
    .filter(k => !(report.sections ?? []).some(s => s.area_key === k))
  if (unknownKeys.length > 0) {
    return NextResponse.json(
      { error: `존재하지 않는 area_key: ${unknownKeys.join(', ')}` },
      { status: 400 },
    )
  }

  const verifyReport: VerifyReport = { dropped: [], warnings: [] }
  const nextSections = (report.sections ?? []).map(section => {
    const input = byKey.get(section.area_key)
    if (!input) return section   // 분석이 없는 영역은 사실만 유지
    return verifyAnalysis(section, input, verifyReport)
  })

  const summary = typeof analysis.summary === 'string' ? analysis.summary.trim() : null
  const overallImpact = isImpactValue(analysis.overall_impact) ? analysis.overall_impact : null
  const emergingTopics = Array.isArray(analysis.emerging_topics)
    ? (analysis.emerging_topics as unknown[]).filter((t): t is string => typeof t === 'string')
    : []

  const admin = gate.admin
  const { error: updateError } = await admin
    .from('competitor_weekly_reports')
    .update({
      summary,
      overall_impact: overallImpact,
      emerging_topics: emergingTopics,
      sections: nextSections,
      status: 'draft',   // 발행은 별도 버튼 — 사람이 미리보기 후 결정
    })
    .eq('week_start', weekStart)

  if (updateError) {
    console.error('[CompetitorWeekly] 분석 저장 실패:', updateError.message)
    return NextResponse.json({ error: '저장에 실패했습니다.' }, { status: 500 })
  }

  return NextResponse.json({
    ok: true,
    weekStart,
    analyzedAreas: byKey.size,
    dropped: verifyReport.dropped,
    warnings: verifyReport.warnings,
  })
}
