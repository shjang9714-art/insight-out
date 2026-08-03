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

// ─── 378: 스크립트 청킹 (긴 브리핑 → 60초/단일요청 한도 초과로 인한 504 방지) ─────

/**
 * 청크당 목표 크기(문자). 379 실측: Gemini TTS는 대략 ~18~19자/초로 느려서
 * 981자 청크가 약 52초 걸림 — 1600자(378 값)는 ~85초로 per-chunk 타임아웃(120초)엔
 * 들어와도 여유가 부족해 700~800자(약 40~45초)로 낮춰 여유를 확보한다.
 */
const MAX_CHUNK_CHARS = 750

/** Gemini TTS 실측 처리 속도 역수(초/자). 예산 계산·사전 가드에 공통 사용. */
const SECONDS_PER_CHAR = 0.055

/** Vercel maxDuration(300초) 대비 여유를 둔 총 예산 — 초과 예상이면 시작 전에 중단시킨다. */
const TOTAL_BUDGET_SECONDS = 280

/** 청크 간 간격(ms). 무료 티어 분당 요청 한도(RPM) 완화용. env로 조절 가능(재배포만).
 *  기본 15초 — 순차 합성(~40초/청크)과 합쳐 요청 간격 ~55초로 벌린다. */
const CHUNK_GAP_MS = Number(process.env.TTS_CHUNK_GAP_MS ?? 15_000)

/** 문장 종결부호(.!?) 또는 빈 줄(문단 경계) 기준으로 스크립트를 문장 단위로 분리 */
function splitIntoSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+|\n{2,}/)
    .map((s) => s.trim())
    .filter(Boolean)
}

/** 문장 경계를 지키며 청크당 ~MAX_CHUNK_CHARS 이내로 그리디 병합. 단일 문장이 한도를 넘으면 그 문장 하나만으로 청크를 강제 구성한다. */
function chunkScript(script: string, maxChars = MAX_CHUNK_CHARS): string[] {
  const sentences = splitIntoSentences(script)
  const chunks: string[] = []
  let current = ''

  for (const sentence of sentences) {
    if (sentence.length > maxChars) {
      if (current) { chunks.push(current); current = '' }
      chunks.push(sentence)
      continue
    }
    const candidate = current ? `${current} ${sentence}` : sentence
    if (candidate.length > maxChars) {
      chunks.push(current)
      current = sentence
    } else {
      current = candidate
    }
  }
  if (current) chunks.push(current)
  return chunks.length ? chunks : [script]
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

type ChunkSynthesisResult =
  | { ok: true; pcm: Buffer; sampleRate: number }
  | { ok: false; reason: string; isRateLimit: boolean }

/**
 * 청크 1개를 Gemini TTS로 합성.
 * - 429는 두 종류를 구분한다(381 실측, gemini-3.1-flash-tts-preview 기준):
 *   1) 일일 무료 쿼터 소진(RESOURCE_EXHAUSTED, quotaId에 "PerDay" 포함) — 재시도해도
 *      자정 전까지 절대 안 풀리므로 즉시 중단하고 "내일 다시 시도" 안내로 반환.
 *   2) 그 외(분당 rate limit 등 일시적 429) — 최대 2회 백오프 재시도.
 * - 503(일시적 용량 부족 — 프리뷰 모델이 간헐적으로 "high demand" 503을 반환)도 최대 2회
 *   백오프 재시도하되, rate limit이 아니라 가용성 문제이므로 isRateLimit은 세우지 않는다
 *   (route.ts 등 호출부가 "요청 한도 초과"로 오인하지 않도록 구분).
 * - 텍스트-생성 가드레일 400("should only be used for TTS")·오디오 데이터 누락은
 *   대본 그대로 낭독하라는 지시로 감싸 1회 재시도(방어적 폴백 — 381 실측 시점엔 프로덕션
 *   모델에서 재현되지 않았지만, 비용 없는 안전장치라 함께 둔다).
 */
async function synthesizeChunk(params: {
  chunk: string
  chunkIndex: number
  totalChunks: number
  model: string
  voice: string
  apiKey: string
}): Promise<ChunkSynthesisResult> {
  const { chunk, chunkIndex, totalChunks, model, voice, apiKey } = params
  const label = `청크 ${chunkIndex + 1}/${totalChunks}`
  const MAX_RETRIES = 2
  let forceTranscript = false

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      // 400 가드레일 감지 시 "그대로 낭독" 지시로 감싼다(지시문은 톤 가이드로만 쓰이고 낭독되지 않음).
      const promptText = forceTranscript
        ? `다음 큰따옴표 안 문장을 한국어로 그대로 또박또박 낭독하세요. 질문에 답하지 말고 문장만 읽으세요.\n\n"${chunk}"`
        : chunk

      const res = await fetch(`${GEMINI_TTS_ENDPOINT_BASE}/${model}:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: promptText }] }],
          generationConfig: {
            responseModalities: ['AUDIO'],
            speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } },
          },
        }),
        signal: AbortSignal.timeout(120_000),
      })

      if (res.status === 429) {
        const body = await res.text().catch(() => '')
        // 일일 무료 쿼터 소진(quotaId: GenerateRequestsPerDayPerProjectPerModel-FreeTier 등,
        // "PerDay" 포함) — 재시도해도 자정(쿼터 리셋) 전까지 무의미하므로 즉시 중단.
        if (/PerDay/i.test(body)) {
          console.error(`[TTS] ${label}: Gemini 일일 무료 쿼터 소진(429 PerDay, 재시도 생략): ${body.slice(0, 400)}`)
          return {
            ok: false,
            isRateLimit: true,
            reason: `${label}: 오늘 Gemini TTS 무료 요청 한도(rate limit)를 모두 사용했습니다. 내일(쿼터 리셋 후) 다시 시도해주세요.`,
          }
        }
        console.error(`[TTS] ${label}: Gemini 429(rate limit) 시도 ${attempt + 1}/${MAX_RETRIES + 1}: ${body.slice(0, 300)}`)
        if (attempt < MAX_RETRIES) {
          await sleep(8_000 * (attempt + 1)) // 8s·16s — 분당 리셋 대비(385)
          continue
        }
        return {
          ok: false,
          isRateLimit: true,
          reason: `${label}: Gemini TTS 요청 한도(rate limit)를 초과했습니다. 잠시 후 다시 시도해주세요.`,
        }
      }
      if (res.status === 503) {
        const body = await res.text().catch(() => '')
        console.error(`[TTS] ${label}: Gemini 503(일시적 용량 부족) 시도 ${attempt + 1}/${MAX_RETRIES + 1}: ${body.slice(0, 300)}`)
        if (attempt < MAX_RETRIES) {
          await sleep(8_000 * (attempt + 1)) // 8s·16s — 분당 리셋 대비(385)
          continue
        }
        // rate limit이 아니라 가용성 문제라 isRateLimit은 세우지 않는다(429와 혼동 방지).
        return {
          ok: false,
          isRateLimit: false,
          reason: `${label}: Gemini TTS 서버가 일시적으로 혼잡합니다(503). 잠시 후 다시 시도해주세요.`,
        }
      }
      if (!res.ok) {
        const body = await res.text().catch(() => '')
        if (res.status === 400 && /should only be used for TTS|generate text/i.test(body) && !forceTranscript) {
          console.warn(`[TTS] ${label}: 텍스트-생성 가드레일 400 → 대본 지시로 재시도`)
          forceTranscript = true
          continue
        }
        console.error(`[TTS] ${label}: Gemini HTTP ${res.status}: ${body.slice(0, 500)}`)
        return { ok: false, isRateLimit: false, reason: `${label}: TTS 합성 중 오류가 발생했습니다(HTTP ${res.status}).` }
      }

      const data = (await res.json()) as GeminiTtsResponse
      const inline = data.candidates?.[0]?.content?.parts?.[0]?.inlineData
      if (!inline?.data) {
        if (!forceTranscript) {
          console.warn(`[TTS] ${label}: 오디오 데이터 없음 → 대본 지시로 재시도`)
          forceTranscript = true
          continue
        }
        console.error(`[TTS] ${label}: Gemini 응답에 오디오 데이터 없음: ${JSON.stringify(data).slice(0, 500)}`)
        return { ok: false, isRateLimit: false, reason: `${label}: TTS 응답에 오디오 데이터가 없습니다.` }
      }

      const rateMatch = /rate=(\d+)/.exec(inline.mimeType ?? '')
      const sampleRate = rateMatch ? Number(rateMatch[1]) : 24000
      return { ok: true, pcm: Buffer.from(inline.data, 'base64'), sampleRate }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error(`[TTS] ${label}: 합성 실패(시도 ${attempt + 1}/${MAX_RETRIES + 1}): ${message}`)
      if (attempt < MAX_RETRIES) {
        await sleep(1000)
        continue
      }
      return { ok: false, isRateLimit: false, reason: `${label}: TTS 합성 중 오류가 발생했습니다(${message}).` }
    }
  }
  // 도달 불가 — 루프는 항상 return 으로 종료됨
  return { ok: false, isRateLimit: false, reason: `${label}: TTS 합성 중 알 수 없는 오류가 발생했습니다.` }
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

  // 379 — 총 예산 가드: 합성 시작 전에 예상 소요를 계산해, maxDuration(300초) 예산을
  // 초과할 것으로 보이면 504로 끝나기 전에 명확한 사유로 사전 중단한다.
  const estimatedChunks = Math.max(1, Math.ceil(script.length / MAX_CHUNK_CHARS))
  const estimatedSeconds = Math.round(
    script.length * SECONDS_PER_CHAR + (estimatedChunks - 1) * (CHUNK_GAP_MS / 1000),
  )
  if (estimatedSeconds > TOTAL_BUDGET_SECONDS) {
    console.error(`[TTS] 예산 초과 사전중단 briefing=${briefingId} chars=${script.length} estimated=${estimatedSeconds}s budget=${TOTAL_BUDGET_SECONDS}s`)
    return {
      ok: false,
      reason: `스크립트가 너무 길어 한 번에 합성할 수 없습니다(약 ${estimatedSeconds}초 예상). 스크립트를 줄이거나 분할 발행하세요.`,
    }
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

  // 4. 스크립트 청킹 + 순차 합성 (378 — 60초/단일요청 한도 초과로 인한 504 방지)
  const chunks = chunkScript(script)
  console.log(`[TTS] briefing=${briefingId} chars=${script.length} chunks=${chunks.length} month_used=${monthUsed} model=${model} voice=${voice}`)

  const pcmChunks: Buffer[] = []
  let sampleRate: number | null = null
  const synthesisStartedAt = Date.now()

  for (let i = 0; i < chunks.length; i++) {
    if (i > 0) await sleep(CHUNK_GAP_MS) // 청크 간 간격 — 무료 티어 RPM 완화(385)

    const chunkStartedAt = Date.now()
    const result = await synthesizeChunk({
      chunk: chunks[i],
      chunkIndex: i,
      totalChunks: chunks.length,
      model,
      voice,
      apiKey,
    })
    const chunkElapsedMs = Date.now() - chunkStartedAt

    if (!result.ok) {
      console.error(`[TTS] 청크 ${i + 1}/${chunks.length} 실패(${chunkElapsedMs}ms): ${result.reason}`)
      return { ok: false, reason: result.reason }
    }
    console.log(`[TTS] 청크 ${i + 1}/${chunks.length} 완료: ${chunks[i].length}자, ${chunkElapsedMs}ms`)

    if (sampleRate === null) {
      sampleRate = result.sampleRate
    } else if (result.sampleRate !== sampleRate) {
      const reason = `청크 ${i + 1}/${chunks.length}: 샘플레이트가 일치하지 않습니다(${result.sampleRate} vs ${sampleRate}).`
      console.error(`[TTS] ${reason}`)
      return { ok: false, reason }
    }

    pcmChunks.push(result.pcm)
  }

  console.log(`[TTS] briefing=${briefingId} 전체 합성 완료: 청크 ${chunks.length}개, 총 ${Date.now() - synthesisStartedAt}ms`)

  const pcmBuffer = Buffer.concat(pcmChunks)
  const finalSampleRate = sampleRate ?? 24000
  const wavBuffer = pcmToWav(pcmBuffer, finalSampleRate)
  const durationSeconds = Math.round((pcmBuffer.length / (finalSampleRate * 1 * 2)) * 10) / 10

  // 5. Storage 업로드
  const storagePath = `${briefing.briefing_date}/${briefingId}.wav`
  const { error: uploadError } = await admin.storage
    .from('briefings')
    .upload(storagePath, wavBuffer, { contentType: 'audio/wav', upsert: true })

  if (uploadError) {
    const bucketMissing = /bucket not found/i.test(uploadError.message)
    console.error('[TTS] Storage 업로드 실패:', uploadError.message)
    return {
      ok: false,
      reason: bucketMissing
        ? '"briefings" Storage 버킷이 없습니다. Supabase 대시보드에서 버킷을 생성해주세요.'
        : `Storage 업로드 중 오류가 발생했습니다: ${uploadError.message}`,
    }
  }

  const audioUrl = `briefings/${storagePath}`

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
    .update({ audio_url: audioUrl, voice, audio_duration_seconds: Math.round(durationSeconds) })
    .eq('id', briefingId)

  if (updateError) {
    console.error('[TTS] briefings 갱신 실패:', updateError.message)
    return { ok: false, reason: 'DB 갱신 중 오류가 발생했습니다.' }
  }

  return { ok: true, audioUrl }
}
