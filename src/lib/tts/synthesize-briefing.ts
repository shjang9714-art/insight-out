import 'server-only'

import { TextToSpeechClient } from '@google-cloud/text-to-speech'
import { createAdminClient } from '@/lib/supabase/admin'

// ─── 기간 헬퍼 (translate/index.ts 와 동일 로직) ────────────────────────────

function getKstPeriod(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
  }).format(new Date())
}

// ─── GCP 클라이언트 초기화 ────────────────────────────────────────────────────

function createTtsClient(): TextToSpeechClient {
  const keyBase64 = process.env.GCP_TTS_SA_KEY_BASE64
  if (!keyBase64) {
    throw new Error('GCP_TTS_SA_KEY_BASE64 환경변수가 설정되지 않았습니다.')
  }
  const sa = JSON.parse(Buffer.from(keyBase64, 'base64').toString('utf8'))
  return new TextToSpeechClient({
    credentials: { client_email: sa.client_email, private_key: sa.private_key },
    projectId: sa.project_id,
  })
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

  const script = briefing.script.trim()
  const period = getKstPeriod()
  // 기본 보이스가 WaveNet(ko-KR-Wavenet-C)이라 무료 한도는 100만 자/월. 보수적으로 90만.
  // (Vercel 에 TTS_MONTHLY_CHAR_CAP 미설정 시 이 값이 가드로 작동.)
  const cap = Number(process.env.TTS_MONTHLY_CHAR_CAP ?? 900_000)

  // 2. 캡 체크 (합성 전)
  const { data: usageRows, error: usageError } = await admin
    .from('tts_usage')
    .select('chars')
    .eq('provider', 'google')
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

  // 3. GCP TTS 클라이언트 초기화 (환경변수 없으면 여기서 throw)
  let ttsClient: TextToSpeechClient
  try {
    ttsClient = createTtsClient()
  } catch (err) {
    console.error('[TTS] 클라이언트 초기화 실패:', err instanceof Error ? err.message : String(err))
    return { ok: false, reason: 'TTS 서비스 설정 오류입니다. 서버 환경변수를 확인해주세요.' }
  }

  const voice = (briefing.voice as string | null) || process.env.GCP_TTS_VOICE || 'ko-KR-Wavenet-C'

  console.log(`[TTS] briefing=${briefingId} chars=${script.length} month_used=${monthUsed} voice=${voice}`)

  // 4. 합성
  let audioBytes: Uint8Array
  try {
    const [response] = await ttsClient.synthesizeSpeech({
      input: { text: script },
      voice: { languageCode: 'ko-KR', name: voice },
      audioConfig: { audioEncoding: 'MP3' },
    })

    if (!response.audioContent) {
      return { ok: false, reason: 'TTS 응답에 오디오 데이터가 없습니다.' }
    }
    audioBytes = response.audioContent as Uint8Array
  } catch (err) {
    console.error('[TTS] Google Cloud TTS 합성 실패:', err instanceof Error ? err.message : String(err))
    return { ok: false, reason: 'TTS 합성 중 오류가 발생했습니다.' }
  }

  // 5. Storage 업로드
  const storagePath = `${briefing.briefing_date}/${briefingId}.mp3`
  const { error: uploadError } = await admin.storage
    .from('briefings')
    .upload(storagePath, audioBytes, { contentType: 'audio/mpeg', upsert: true })

  if (uploadError) {
    console.error('[TTS] Storage 업로드 실패:', uploadError.message)
    return { ok: false, reason: 'Storage 업로드 중 오류가 발생했습니다.' }
  }

  const { data: urlData } = admin.storage.from('briefings').getPublicUrl(storagePath)
  const audioUrl = urlData.publicUrl

  // 6. 사용량 기록 (합성 성공 후에만)
  const { error: incrementError } = await admin.rpc('increment_tts_usage', {
    p_provider: 'google',
    p_period: period,
    p_chars: script.length,
  })
  if (incrementError) {
    // 오디오는 살리되 에러 로그만
    console.error('[TTS] 사용량 기록 실패 (오디오는 정상 저장됨):', incrementError.message)
  }

  // 7. briefings 갱신 (audio_url·voice — status 는 건드리지 않음)
  // audio_duration_seconds: Google TTS 는 길이를 반환하지 않음 → null 허용.
  // 플레이어가 loadedmetadata 이벤트로 표시함.
  // 정확한 길이가 필요한 경우: LINEAR16(WAV)로 합성해 PCM 샘플 수 / 샘플레이트로 계산 가능.
  const { error: updateError } = await admin
    .from('briefings')
    .update({ audio_url: audioUrl, voice, audio_duration_seconds: null })
    .eq('id', briefingId)

  if (updateError) {
    console.error('[TTS] briefings 갱신 실패:', updateError.message)
    return { ok: false, reason: 'DB 갱신 중 오류가 발생했습니다.' }
  }

  return { ok: true, audioUrl }
}
