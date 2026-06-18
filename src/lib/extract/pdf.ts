import 'server-only'

// unpdf — 서버리스 호환 PDF 텍스트 추출 (네이티브 의존 없음, Vercel Node 런타임 지원)
// 사유(#18): PDF.js 기반, edge/서버리스에서 동작하며 네이티브 바이너리 불필요
import { extractText } from 'unpdf'

const BODY_MAX_CHARS = 100_000
const SCAN_THRESHOLD = 200

/** PDF 버퍼에서 텍스트를 추출하여 반환한다. 실패 시 빈 문자열. */
export async function extractPdfText(buffer: Uint8Array): Promise<string> {
  const { text } = await extractText(buffer, { mergePages: true })
  const joined = Array.isArray(text) ? text.join('\n') : (text ?? '')
  const cleaned = joined.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim()
  return cleaned.slice(0, BODY_MAX_CHARS)
}

/** 텍스트 길이가 스캔(이미지) PDF 임계 미만인지 확인한다. */
export function isScannedPdf(text: string): boolean {
  return text.length < SCAN_THRESHOLD
}

/**
 * 간단 언어 감지 — 한글 음절 비율 기반.
 * 한글 음절이 10% 이상이면 'ko', 라틴 문자가 50% 이상이면 'en', 그 외 'other'.
 */
export function detectLang(text: string): 'ko' | 'en' | 'other' {
  const sample = text.slice(0, 2000)
  if (!sample) return 'other'
  const total = sample.replace(/\s/g, '').length || 1
  const koreanChars = (sample.match(/[가-힣]/g) ?? []).length
  const latinChars  = (sample.match(/[a-zA-Z]/g) ?? []).length
  if (koreanChars / total >= 0.10) return 'ko'
  if (latinChars  / total >= 0.50) return 'en'
  return 'other'
}
