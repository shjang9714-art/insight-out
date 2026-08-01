import { verifyAdminRequest } from '@/lib/admin/verify-admin-request'
import { NextResponse } from 'next/server'
import { stripLlmArtifacts } from '@/lib/text/strip-llm-artifacts'
import { resolveBriefingAudioUrl } from '@/lib/briefing/audio-url'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function getKstPeriod(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
  }).format(new Date())
}

interface BriefingHighlight {
  content_id: string
  keyword?: string
  insight: string
  detail?: string
}

interface BriefingRow {
  title: string | null
  script: string | null
  audio_url: string | null
  highlights: BriefingHighlight[] | null
}

function sanitizeHighlights(highlights: unknown): BriefingHighlight[] | null {
  if (!Array.isArray(highlights)) return null

  return highlights
    .filter((item): item is BriefingHighlight => (
      item !== null &&
      typeof item === 'object' &&
      typeof (item as BriefingHighlight).content_id === 'string' &&
      typeof (item as BriefingHighlight).insight === 'string'
    ))
    .map((item) => ({
      ...item,
      keyword: typeof item.keyword === 'string' ? stripLlmArtifacts(item.keyword) : item.keyword,
      insight: stripLlmArtifacts(item.insight),
      detail: typeof item.detail === 'string' ? stripLlmArtifacts(item.detail) : item.detail,
    }))
}

function sanitizeBriefing<T extends BriefingRow>(briefing: T): T {
  const resolvedBriefing = resolveBriefingAudioUrl(briefing)
  return {
    ...resolvedBriefing,
    title: briefing.title ? stripLlmArtifacts(briefing.title) : briefing.title,
    script: briefing.script ? stripLlmArtifacts(briefing.script) : briefing.script,
    highlights: sanitizeHighlights(briefing.highlights),
  }
}


/**
 * GET /api/admin/briefings
 * 어드민 전용 — 전체 브리핑 목록(draft 포함) + 이번 달 TTS 사용량 반환.
 */
export async function GET() {
  try {
    const gate = await verifyAdminRequest()
    if (!gate.ok) return gate.response

    const admin = gate.admin
    const period = getKstPeriod()
    // WaveNet 무료 한도 100만/월 → 보수적으로 90만. (synthesize-briefing.ts 기본값과 일치)
    const cap = Number(process.env.TTS_MONTHLY_CHAR_CAP ?? 900_000)

    const [briefingsResult, usageResult] = await Promise.all([
      admin
        .from('briefings')
        .select('id, briefing_date, title, script, audio_url, audio_duration_seconds, voice, status, error_reason, generated_at, published_at, updated_at, highlights')
        .order('briefing_date', { ascending: false })
        .limit(60),
      admin
        .from('tts_usage')
        .select('chars')
        .eq('provider', 'google')
        .eq('period', period)
        .maybeSingle(),
    ])

    if (briefingsResult.error) throw briefingsResult.error

    const used = Number(usageResult.data?.chars ?? 0)

    return NextResponse.json({
      period,
      tts: { used, cap },
      briefings: (briefingsResult.data ?? []).map((briefing) =>
        sanitizeBriefing(briefing as BriefingRow)
      ),
    })
  } catch (err) {
    console.error('[GET /api/admin/briefings] 오류:', err)
    return NextResponse.json(
      { error: '브리핑 목록을 불러오지 못했습니다.' },
      { status: 500 }
    )
  }
}
