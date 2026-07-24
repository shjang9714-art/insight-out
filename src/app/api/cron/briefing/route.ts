import type { NextRequest } from 'next/server'
import { generateBriefing } from '@/lib/briefing/generate-briefing'
import { createAdminClient } from '@/lib/supabase/admin'
import { runJob } from '@/lib/jobs/run-job'
import { synthesizeBriefingAudio } from '@/lib/tts/synthesize-briefing'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return Response.json({ ok: false, error: '인증 실패' }, { status: 401 })
  }

  try {
    const admin = createAdminClient()
    const result = await runJob(admin, { key: 'cron:briefing', trigger: 'cron' }, async () => {
      const force = request.nextUrl.searchParams.get('force') === '1'
      const date = request.nextUrl.searchParams.get('date') ?? undefined

      const result = await generateBriefing({ force, date, autoPublish: true })
      if (!result.ok) return result

      // 스크립트 생성·발행 성공 후 오디오도 생성한다. TTS 실패는 발행 결과와 격리한다.
      try {
        const { data: briefing, error: audioLookupError } = await admin
          .from('briefings')
          .select('audio_url')
          .eq('id', result.briefingId)
          .maybeSingle()

        if (audioLookupError) {
          console.error('[크론/briefing] 기존 오디오 조회 실패(TTS 스킵):', audioLookupError.message)
          return {
            ...result,
            tts: { ok: false, skipped: true, reason: '기존 오디오 조회 실패' },
          }
        }

        if (briefing?.audio_url) {
          console.log(`[크론/briefing] 기존 오디오 유지 briefing=${result.briefingId}`)
          return {
            ...result,
            tts: { ok: true, skipped: true, reason: '이미 오디오 생성됨' },
          }
        }

        const tts = await synthesizeBriefingAudio(result.briefingId)
        if (!tts.ok) {
          console.warn('[크론/briefing] TTS 스킵:', tts.reason)
        }
        return { ...result, tts }
      } catch (ttsError) {
        console.error('[크론/briefing] TTS 실패(브리핑 발행은 유지):', ttsError)
        return {
          ...result,
          tts: { ok: false, reason: 'TTS 처리 중 예외 발생' },
        }
      }
    })
    return Response.json(result)
  } catch (err) {
    console.error('[크론/briefing] 브리핑 생성 오류:', err)
    const message = err instanceof Error ? err.message : String(err)
    return Response.json(
      { ok: false, error: '브리핑 생성 중 오류가 발생했습니다.', detail: message },
      { status: 500 }
    )
  }
}
