import 'server-only'
import { llmComplete } from '@/lib/llm'

const SUMMARY_INPUT_MAXCHARS = 2000

const SYSTEM_PROMPT =
  '당신은 B2B 텔레콤/엔터프라이즈 시장 정보 요약가다. ' +
  '입력 기사를 한국어 2~3문장으로 핵심만 요약하라. ' +
  '사실만, 추측·과장 금지. 요약문만 출력(머리말·따옴표·목록 금지).'

/**
 * LLM 으로 한국어 2~3문장 요약을 생성한다.
 * 키 미등록·한도소진·실패 시 null 반환(호출부는 summary_ko 미설정 → UI 폴백).
 */
export async function summarizeKo(titleKo: string, bodyKo: string): Promise<string | null> {
  try {
    const user = `제목: ${titleKo}\n본문: ${bodyKo.slice(0, SUMMARY_INPUT_MAXCHARS)}`
    const out = await llmComplete('summarize', SYSTEM_PROMPT, user)
    if (!out) return null
    const trimmed = out.trim()
    return trimmed || null
  } catch (e) {
    console.error('[요약] 요약 생성 실패:', e)
    return null
  }
}

const YOUTUBE_SYSTEM_PROMPT =
  '당신은 B2B 텔레콤/엔터프라이즈 시장 정보 분석가다. ' +
  '입력된 유튜브 영상의 제목과 채널명만으로 이 영상의 핵심 내용을 한국어 3~5줄로 추정 요약하라. ' +
  '자막 없이 제목 기반 추정임을 감안해 과장 없이 작성하라. 요약문만 출력(머리말·따옴표·목록 금지).'

/**
 * 유튜브는 본문이 없어 제목+채널명만으로 추정 요약한다(266).
 * 수집/백필 시점에 1회 호출 — 사용자 클릭 경로에서는 호출하지 않는다.
 */
export async function summarizeYoutubeKo(title: string, channelName: string | null): Promise<string | null> {
  try {
    const user = `제목: ${title}${channelName ? `\n채널: ${channelName}` : ''}`
    const out = await llmComplete('summarize', YOUTUBE_SYSTEM_PROMPT, user)
    if (!out) return null
    const trimmed = out.trim()
    return trimmed || null
  } catch (e) {
    console.error('[요약] 유튜브 요약 생성 실패:', e)
    return null
  }
}
