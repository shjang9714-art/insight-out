import { verifyAdminRequest } from '@/lib/admin/verify-admin-request'
import { NextResponse } from 'next/server'
import { synthesizeBriefingAudio } from '@/lib/tts/synthesize-briefing'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300


/**
 * POST /api/admin/briefings/[id]/tts
 * 어드민 전용 — 브리핑 script 를 Gemini API TTS(무료 티어)로 합성 후 Storage 에 업로드(375).
 * #49 어드민 "오디오 생성/재생성" 버튼의 호출 대상.
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const gate = await verifyAdminRequest()
    if (!gate.ok) return gate.response

    const { id } = await params
    if (!id) {
      return NextResponse.json({ error: '브리핑 ID가 필요합니다.' }, { status: 400 })
    }

    const result = await synthesizeBriefingAudio(id)

    if (!result.ok) {
      const status =
        result.reason === '월 한도 초과' ? 409 :
        result.reason === '스크립트 없음' ? 400 :
        result.reason.includes('찾을 수 없') ? 404 :
        result.reason.includes('rate limit') ? 429 :
        500
      return NextResponse.json({ ok: false, reason: result.reason }, { status })
    }

    return NextResponse.json({ ok: true, audioUrl: result.audioUrl }, { status: 200 })
  } catch (err) {
    console.error('[/api/admin/briefings/[id]/tts] 오류:', err)
    return NextResponse.json(
      { error: 'TTS 처리 중 오류가 발생했습니다. 서버 설정을 확인해주세요.' },
      { status: 500 }
    )
  }
}
