import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import { stripLlmArtifacts } from '@/lib/text/strip-llm-artifacts'

// ─── 기간 헬퍼 (translate/index.ts 와 동일 로직) ────────────────────────────

function getKstPeriod(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
  }).format(new Date())
}

// ─── 375: GCP TTS → Gemini API TTS(무료 티어, 결제 불필요) 교체 ───────────────

const GEMINI_TTS_ENDPOINT_BASE = 'https://generativelanguage.googleapis.com/v1beta/models'

function getGeminiApiKey(): string | null {
  const single = process.env.GEMINI_API_KEY?.trim()
  if (single) return single
  const multi = (process.env.GEMINI_API_KEYS ?? '').split(',').map(k => k.trim()).filter(Boolean)
  return multi[0] ?? null
}

// ai.google.dev/gemini-api/docs/generate-content/speech-generation(2026-07 확인) 기준 유효 모델.
const DEFAULT_GEMINI_TTS_MODEL = 'gemini-2.5-flash-preview-tts'

function getGeminiTtsModel(): string {
  return (process.env.GEMINI_TTS_MODEL ?? '').trim() || DEFAULT_GEMINI_TTS_MODEL
}

// ai.google.dev 문서(2026-07) 기준 30개 prebuilt voice 전체 — 지정된 voice가 이미
// Gemini voice면 매핑 없이 그대로 통과시키기 위한 판별 집합.
const GEMINI_PREBUILT_VOICES = new Set([
  'Zephyr', 'Puck', 'Charon', 'Kore', 'Fenrir', 'Leda', 'Orus', 'Aoede',
  'Callirrhoe', 'Autonoe', 'Enceladus', 'Iapetus', 'Umbriel', 'Algieba',
  'Despina', 'Erinome', 'Algenib', 'Rasalgethi', 'Laomedeia', 'Achernar',
  'Alnilam', 'Schedar', 'Gacrux', 'Pulcherrima', 'Achird', 'Zubenelgenubi',
  'Vindemiatrix', 'Sadachbia', 'Sadaltager', 'Sulafat',
])

// 기존 GCP ko-KR 보이스 → Gemini prebuilt voice 매핑(성별 톤 기준 근사치).
// 목록에 없는 GCP 보이스나 미설정은 GEMINI_TTS_VOICE(기본 'Kore')로 폴백한다.
const GCP_TO_GEMINI_VOICE: Record<string, string> = {
  'ko-KR-Wavenet-A': 'Aoede',
  'ko-KR-Wavenet-B': 'Kore',
  'ko-KR-Wavenet-C': 'Charon',
  'ko-KR-Wavenet-D': 'Puck',
  'ko-KR-Standard-A': 'Aoede',
  'ko-KR-Standard-B': 'Kore',
  'ko-KR-Standard-C': 'Charon',
  'ko-KR-Standard-D': 'Puck',
  'ko-KR-Neural2-A': 'Aoede',
  'ko-KR-Neural2-B': 'Kore',
  'ko-KR-Neural2-C': 'Charon',
}

function resolveGeminiVoice(storedVoice: string | null): string {
  if (storedVoice && GEMINI_PREBUILT_VOICES.has(storedVoice)) return storedVoice
  if (storedVoice && GCP_TO_GEMINI_VOICE[storedVoice]) return GCP_TO_GEMINI_VOICE[storedVoice]
  return (process.env.GEMINI_TTS_VOICE ?? '').trim() || 'Kore'
}

interface GeminiTtsResponse {
  candidates?: Array<{
    content?: { parts?: Array<{ inlineData?: { mimeType?: string; data?: string } }> }
  }>
}

/** PCM(16-bit LE, mono) → WAV. mimeType의 rate= 를 파싱해 샘플레이트를 정확히 반영한다. */
function pcmToWav(pcm: Buffer, sampleRate: number, channels = 1, bitDepth = 16): Buffer {
  const byteRate = sampleRate * channels * (bitDepth / 8)
  const blockAlign = channels * (bitDepth / 8)
  const header = Buffer.alloc(44)
  header.write('RIFF', 0, 'ascii')
  header.writeUInt32LE(36 + pcm.length, 4)
  header.write('WAVE', 8, 'ascii')
  header.write('fmt ', 12, 'ascii')
  header.writeUInt32LE(16, 16)          // fmt 청크 길이(PCM)
  header.writeUInt16LE(1, 20)           // audio format = 1(PCM)
  header.writeUInt16LE(channels, 22)
  header.writeUInt32LE(sampleRate, 24)
  header.writeUInt32LE(byteRate, 28)
  header.writeUInt16LE(blockAlign, 32)
  header.writeUInt16LE(bitDepth, 34)
  header.write('data', 36, 'ascii')
  header.writeUInt32LE(pcm.length, 40)
  return Buffer.concat([header, pcm])
}

// ─── 타입 ─────────────────────────────────────────────────────────────────────

type SynthesisResult =
  | { ok: true; audioUrl: string }
  | { ok: false; reason: string }

// ─── 메인 함수 ────────────────────────────────────────────────────────────────

export async function synthesizeBriefingAudio(briefingId: string): Promise<SynthesisResult> {
  const admin = createAdminClient()

  // 1. briefing 조회
  const { data: briefing, error: fetchError } = await admin
    .from('briefings')
    .select('id, briefing_date, script, voice, status')
    .eq('id', briefingId)
    .maybeSingle()

  if (fetchError) {
    console.error('[TTS] briefing 조회 실패:', fetchError.message)
    return { ok: false, reason: '브리핑 조회 중 오류가 발생했습니다.' }
  }
  if (!briefing) {
    return { ok: false, reason: '브리핑을 찾을 수 없습니다.' }
  }
  if (!briefing.script?.trim()) {
    return { ok: false, reason: '스크립트 없음' }
  }

  const script = stripLlmArtifacts(briefing.script).trim()
  if (!script) {
    return { ok: false, reason: '스크립트 없음' }
  }
  const period = getKstPeriod()
  const cap = Number(process.env.TTS_MONTHLY_CHAR_CAP ?? 900_000)

  // 2. 캡 체크 (합성 전) — provider='gemini' 버킷 기준(교체 후 사용량은 여기 누적)
  const { data: usageRows, error: usageError } = await admin
    .from('tts_usage')
    .select('chars')
    .eq('provider', 'gemini')
    .eq('period', period)
    .maybeSingle()

  if (usageError) {
    console.error('[TTS] 사용량 조회 실패:', usageError.message)
    return { ok: false, reason: '사용량 조회 중 오류가 발생했습니다.' }
  }

  const monthUsed = Number(usageRows?.chars ?? 0)
  if (monthUsed + script.length > cap) {
    console.error(`[TTS] 월 한도 초과 briefing=${briefingId} monthUsed=${monthUsed} chars=${script.length} cap=${cap}`)
    return { ok: false, reason: '월 한도 초과' }
  }

  // 3. API 키 확인 (환경변수 없으면 여기서 명확한 에러)
  const apiKey = getGeminiApiKey()
  if (!apiKey) {
    console.error('[TTS] GEMINI_API_KEY / GEMINI_API_KEYS 환경변수가 설정되지 않았습니다.')
    return { ok: false, reason: 'TTS 서비스 설정 오류입니다. 서버 환경변수를 확인해주세요.' }
  }

  const model = getGeminiTtsModel()
  const voice = resolveGeminiVoice(briefing.voice as string | null)

  console.log(`[TTS] briefing=${briefingId} chars=${script.length} month_used=${monthUsed} model=${model} voice=${voice}`)

  // 4. Gemini TTS 합성
  let pcmBuffer: Buffer
  let sampleRate = 24000
  try {
    const res = await fetch(`${GEMINI_TTS_ENDPOINT_BASE}/${model}:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: script }] }],
        generationConfig: {
          responseModalities: ['AUDIO'],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } },
        },
      }),
      signal: AbortSignal.timeout(60_000),
    })

    if (res.status === 429) {
      const body = await res.text().catch(() => '')
      console.error(`[TTS] Gemini 429(rate limit): ${body.slice(0, 300)}`)
      return { ok: false, reason: 'Gemini TTS 요청 한도(rate limit)를 초과했습니다. 잠시 후 다시 시도해주세요.' }
    }
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      console.error(`[TTS] Gemini HTTP ${res.status}: ${body.slice(0, 500)}`)
      return { ok: false, reason: 'TTS 합성 중 오류가 발생했습니다.' }
    }

    const data = (await res.json()) as GeminiTtsResponse
    const inline = data.candidates?.[0]?.content?.parts?.[0]?.inlineData
    if (!inline?.data) {
      console.error(`[TTS] Gemini 응답에 오디오 데이터 없음: ${JSON.stringify(data).slice(0, 500)}`)
      return { ok: false, reason: 'TTS 응답에 오디오 데이터가 없습니다.' }
    }

    const rateMatch = /rate=(\d+)/.exec(inline.mimeType ?? '')
    if (rateMatch) sampleRate = Number(rateMatch[1])
    pcmBuffer = Buffer.from(inline.data, 'base64')
  } catch (err) {
    console.error('[TTS] Gemini TTS 합성 실패:', err instanceof Error ? err.message : String(err))
    return { ok: false, reason: 'TTS 합성 중 오류가 발생했습니다.' }
  }

  const wavBuffer = pcmToWav(pcmBuffer, sampleRate)
  const durationSeconds = Math.round((pcmBuffer.length / (sampleRate * 1 * 2)) * 10) / 10

  // 5. Storage 업로드
  const storagePath = `${briefing.briefing_date}/${briefingId}.wav`
  const { error: uploadError } = await admin.storage
    .from('briefings')
    .upload(storagePath, wavBuffer, { contentType: 'audio/wav', upsert: true })

  if (uploadError) {
    console.error('[TTS] Storage 업로드 실패:', uploadError.message)
    return { ok: false, reason: 'Storage 업로드 중 오류가 발생했습니다.' }
  }

  const { data: urlData } = admin.storage.from('briefings').getPublicUrl(storagePath)
  const audioUrl = urlData.publicUrl

  // 6. 사용량 기록 (합성 성공 후에만)
  const { error: incrementError } = await admin.rpc('increment_tts_usage', {
    p_provider: 'gemini',
    p_period: period,
    p_chars: script.length,
  })
  if (incrementError) {
    // 오디오는 살리되 에러 로그만
    console.error('[TTS] 사용량 기록 실패 (오디오는 정상 저장됨):', incrementError.message)
  }

  // 7. briefings 갱신 (audio_url·voice — status 는 건드리지 않음)
  const { error: updateError } = await admin
    .from('briefings')
    .update({ audio_url: audioUrl, voice, audio_duration_seconds: durationSeconds })
    .eq('id', briefingId)

  if (updateError) {
    console.error('[TTS] briefings 갱신 실패:', updateError.message)
    return { ok: false, reason: 'DB 갱신 중 오류가 발생했습니다.' }
  }

  return { ok: true, audioUrl }
}
