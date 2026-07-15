import { NextRequest, NextResponse } from 'next/server'
import { buildRiseFacts, saveRiseFactors, verifyRiseFactors } from '@/lib/keywords/rise'
import { getKeywordSnapshot } from '@/lib/keywords/detail'
import { RISE_FRAME_FALLBACK } from '@/lib/keywords/rise-frame'
import { loadPrompt } from '@/lib/prompts/load-prompt'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

async function verifyAdmin(): Promise<NextResponse | null> {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) {
    return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })
  }
  const { data: profile } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single()
  if (!profile || profile.role !== 'admin') {
    return NextResponse.json({ error: '관리자 권한이 필요합니다.' }, { status: 403 })
  }
  return null
}

async function checkEligibility(name: string): Promise<{
  eligible: boolean
  changePct: number
  isNew: boolean
}> {
  const snapshot = await getKeywordSnapshot(name)
  return {
    eligible: snapshot.isNew || snapshot.changePct > 0,
    changePct: snapshot.changePct,
    isNew: snapshot.isNew,
  }
}

export async function GET(request: NextRequest) {
  const authError = await verifyAdmin()
  if (authError) return authError

  const name = request.nextUrl.searchParams.get('name')?.trim() ?? ''
  if (!name) {
    return NextResponse.json({ error: 'name 파라미터가 필요합니다.' }, { status: 400 })
  }

  const eligibility = await checkEligibility(name)
  if (!eligibility.eligible) {
    return NextResponse.json(
      { error: '최근 7일 기준 상승 또는 신규 키워드만 분석할 수 있습니다.' },
      { status: 422 },
    )
  }

  const [facts, frame] = await Promise.all([
    buildRiseFacts(name),
    loadPrompt(createAdminClient(), 'keyword_rise_frame', RISE_FRAME_FALLBACK),
  ])
  if (facts.length === 0) {
    return NextResponse.json({ error: '분석할 근거 사건이 없습니다.' }, { status: 404 })
  }

  const prompt = [
    frame,
    '',
    '[키워드]',
    name,
    '',
    '[사건 목록]',
    JSON.stringify(facts, null, 2),
  ].join('\n')

  return NextResponse.json({
    name,
    facts,
    factCount: facts.length,
    changePct: eligibility.changePct,
    isNew: eligibility.isNew,
    frame_spec: frame,
    prompt,
  })
}

interface ImportBody {
  name?: unknown
  analysis?: unknown
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parseAnalysis(value: unknown): Record<string, unknown> | null {
  try {
    const parsed = typeof value === 'string'
      ? JSON.parse(value.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim())
      : value
    return isRecord(parsed) ? parsed : null
  } catch {
    return null
  }
}

function validateAnalysis(analysis: Record<string, unknown>): string | null {
  if (typeof analysis.overview !== 'string' || !analysis.overview.trim()) {
    return 'overview는 비어 있지 않은 문자열이어야 합니다.'
  }
  if (!Array.isArray(analysis.factors) || analysis.factors.length < 3 || analysis.factors.length > 5) {
    return 'factors는 3~5개 배열이어야 합니다.'
  }
  for (const [index, raw] of analysis.factors.entries()) {
    if (!isRecord(raw)) return `factors[${index}]는 객체여야 합니다.`
    if (typeof raw.thesis !== 'string' || !raw.thesis.trim()) {
      return `factors[${index}].thesis는 비어 있지 않은 문자열이어야 합니다.`
    }
    if (typeof raw.detail !== 'string' || !raw.detail.trim()) {
      return `factors[${index}].detail은 비어 있지 않은 문자열이어야 합니다.`
    }
    if (!Array.isArray(raw.evidence) || raw.evidence.length === 0 || raw.evidence.some((id) => typeof id !== 'string')) {
      return `factors[${index}].evidence는 비어 있지 않은 문자열 배열이어야 합니다.`
    }
  }
  return null
}

export async function POST(request: NextRequest) {
  const authError = await verifyAdmin()
  if (authError) return authError

  let body: ImportBody
  try {
    body = await request.json() as ImportBody
  } catch {
    return NextResponse.json({ error: '요청 본문이 JSON이 아닙니다.' }, { status: 400 })
  }

  const name = typeof body.name === 'string' ? body.name.trim() : ''
  if (!name) return NextResponse.json({ error: '키워드 이름이 필요합니다.' }, { status: 400 })
  const analysis = parseAnalysis(body.analysis)
  if (!analysis) {
    return NextResponse.json({ error: '분석 결과가 올바른 JSON이 아닙니다.' }, { status: 400 })
  }
  const schemaError = validateAnalysis(analysis)
  if (schemaError) {
    return NextResponse.json({ error: `분석 결과 스키마 오류: ${schemaError}` }, { status: 400 })
  }

  const eligibility = await checkEligibility(name)
  if (!eligibility.eligible) {
    return NextResponse.json(
      { error: '최근 7일 기준 상승 또는 신규 키워드만 분석할 수 있습니다.' },
      { status: 422 },
    )
  }

  const facts = await buildRiseFacts(name)
  const { verified, report } = verifyRiseFactors(facts, analysis)
  if (verified.factors.length === 0) {
    return NextResponse.json(
      { error: '유효한 근거가 있는 상승 요인이 없어 저장하지 않았습니다.', ...report },
      { status: 400 },
    )
  }

  try {
    await saveRiseFactors(name, verified)
  } catch (error) {
    const message = error instanceof Error ? error.message : '상승 요인을 저장하지 못했습니다.'
    const status = message.includes('351C SQL') ? 503 : 500
    return NextResponse.json({ error: message, ...report }, { status })
  }

  return NextResponse.json({
    savedFactors: verified.factors.length,
    status: 'draft',
    ...report,
  })
}
