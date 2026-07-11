import 'server-only'
import { YoutubeTranscript } from 'youtube-transcript'
import type { SupabaseClient } from '@supabase/supabase-js'
import { translateToKorean } from '@/lib/translate'

const MAX_TRANSCRIPT_CHARS = 20_000

interface RawTranscript {
  transcript: string
  lang: string
}

/** 배치 내 번역 가용성 공유 플래그(265 재현검증 수정) — 한 번 소진되면 배치 나머지에서 번역 호출 자체를 건너뛴다. */
export interface TranslationAvailability {
  exhausted: boolean
}

function joinSegments(segments: { text: string }[], lang: string): RawTranscript | null {
  const text = segments.map((s) => s.text).join(' ').replace(/\s+/g, ' ').trim()
  if (!text) return null
  return { transcript: text.slice(0, MAX_TRANSCRIPT_CHARS), lang }
}

/**
 * 자막 원문 조회 — 한국어 우선, 없으면 사용 가능한 첫 트랙(보통 영어/자동자막)으로 폴백.
 * 자막 없음/조회 실패는 null(graceful) — 크래시 금지(265 §0 현실 3가지).
 */
async function fetchRawTranscript(videoId: string): Promise<RawTranscript | null> {
  try {
    const segments = await YoutubeTranscript.fetchTranscript(videoId, { lang: 'ko' })
    const joined = joinSegments(segments, 'ko')
    if (joined) return joined
  } catch {
    // 한국어 자막 없음 — 아래에서 기본 트랙으로 재시도
  }

  try {
    const segments = await YoutubeTranscript.fetchTranscript(videoId)
    if (segments.length === 0) return null
    const lang = segments[0]?.lang || 'en'
    return joinSegments(segments, lang)
  } catch (e) {
    console.warn(`[유튜브 자막] 조회 실패(videoId=${videoId}):`, e instanceof Error ? e.message : String(e))
    return null
  }
}

/**
 * 한글 번역(필요 시) — 이미 ko면 그대로 반환. availability.exhausted 가 이미 true 면
 * translateToKorean 호출 자체를 건너뛴다(예산 소진 배치가 헛돌지 않도록, 265 재현검증 수정).
 * 실패/예산초과로 null 반환 시 availability.exhausted 를 true 로 세팅.
 */
async function translateIfNeeded(
  text: string,
  lang: string,
  availability: TranslationAvailability,
): Promise<string | null> {
  if (lang === 'ko') return text
  if (availability.exhausted) return null

  try {
    const ko = await translateToKorean(text)
    if (!ko) availability.exhausted = true
    return ko
  } catch (e) {
    console.warn('[유튜브 자막] 번역 실패:', e instanceof Error ? e.message : String(e))
    availability.exhausted = true
    return null
  }
}

export type YoutubeTranscriptOutcome = 'fetched' | 'no_transcript' | 'error'

/**
 * 단일 유튜브 콘텐츠 행의 자막을 수집·번역해 저장한다(265).
 * 성공·실패·자막없음 어느 경우든 transcript_fetched_at 을 마킹해 무한 재시도를 막는다
 * (219·282 의 *_fetched_at 마커 패턴과 동일 — 이 마킹이 빠지면 자막 없는 영상을 매 회차
 * 다시 긁어 rate limit 을 자초한다).
 */
export async function fetchAndSaveYoutubeTranscript(
  admin: SupabaseClient,
  contentId: string,
  videoId: string,
  availability: TranslationAvailability = { exhausted: false },
): Promise<YoutubeTranscriptOutcome> {
  const fetchedAt = new Date().toISOString()

  let raw: RawTranscript | null = null
  try {
    raw = await fetchRawTranscript(videoId)
  } catch (e) {
    console.warn(`[유튜브 자막] 처리 오류(videoId=${videoId}):`, e instanceof Error ? e.message : String(e))
  }

  if (!raw) {
    const { error } = await admin
      .from('contents')
      .update({ transcript_fetched_at: fetchedAt })
      .eq('id', contentId)
    if (error) {
      console.error(`[유튜브 자막] 시도 마킹 실패(contentId=${contentId}):`, error.message)
      return 'error'
    }
    return 'no_transcript'
  }

  const transcriptKo = await translateIfNeeded(raw.transcript, raw.lang, availability)

  const { error } = await admin
    .from('contents')
    .update({
      transcript: raw.transcript,
      transcript_lang: raw.lang,
      transcript_ko: transcriptKo,
      transcript_fetched_at: fetchedAt,
    })
    .eq('id', contentId)

  if (error) {
    console.error(`[유튜브 자막] 저장 실패(contentId=${contentId}):`, error.message)
    return 'error'
  }
  return 'fetched'
}

export type YoutubeTranslateOnlyOutcome = 'translated' | 'skipped' | 'error'

/**
 * 이미 자막(transcript)은 있고 번역(transcript_ko)만 없는 행을 위한 번역 전용 경로(265 재현검증 수정).
 * 유튜브 자막 API를 다시 호출하지 않는다 — rate limit 방지가 목적.
 */
export async function translateExistingYoutubeTranscript(
  admin: SupabaseClient,
  contentId: string,
  transcript: string,
  lang: string,
  availability: TranslationAvailability = { exhausted: false },
): Promise<YoutubeTranslateOnlyOutcome> {
  const transcriptKo = await translateIfNeeded(transcript, lang, availability)
  if (!transcriptKo) return 'skipped'

  const { error } = await admin
    .from('contents')
    .update({ transcript_ko: transcriptKo })
    .eq('id', contentId)

  if (error) {
    console.error(`[유튜브 자막] 번역 저장 실패(contentId=${contentId}):`, error.message)
    return 'error'
  }
  return 'translated'
}
