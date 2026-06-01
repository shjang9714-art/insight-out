import { createHash } from 'crypto'

/**
 * URL 정규화
 * - 소문자 호스트
 * - utm_* · fbclid · gclid · _ga 등 추적 파라미터 제거
 * - fragment(#...) 제거
 * - 경로 끝 슬래시 정리
 * - 쿼리 파라미터 알파벳 정렬
 * 파싱 실패 시 원본 반환
 */
export function normalizeUrl(url: string): string {
  try {
    const parsed = new URL(url)

    // 소문자 호스트
    parsed.hostname = parsed.hostname.toLowerCase()

    // 추적 파라미터 제거
    const removeParams = [
      'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
      'fbclid', 'gclid', '_ga', '_gl',
    ]
    removeParams.forEach(p => parsed.searchParams.delete(p))

    // fragment 제거
    parsed.hash = ''

    // 경로 끝 슬래시 정리 (루트 '/' 제외)
    if (parsed.pathname !== '/') {
      parsed.pathname = parsed.pathname.replace(/\/+$/, '')
    }

    // 쿼리 파라미터 정렬
    parsed.searchParams.sort()

    return parsed.toString()
  } catch {
    // URL 파싱 실패 시 원본 그대로
    return url
  }
}

/**
 * 텍스트 정규화 (해시 입력 표준화)
 * - 소문자화
 * - 한글 이외 특수문자·문장부호 제거
 * - 연속 공백 → 단일 공백
 * - 양끝 공백 제거
 */
export function normalizeText(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^\w\s가-힣]/g, ' ')  // 한글·영숫자·밑줄 외 제거
    .replace(/\s+/g, ' ')           // 연속 공백 단일화
    .trim()
}

/** SHA-256 hex 해시 */
export function sha256(s: string): string {
  return createHash('sha256').update(s, 'utf8').digest('hex')
}

/** 제목 해시 */
export function titleHash(title: string): string {
  return sha256(normalizeText(title))
}

/**
 * 본문 해시
 * 본문이 없거나 빈 문자열이면 null 반환
 */
export function bodyHash(body: string | undefined): string | null {
  if (!body || body.trim().length === 0) return null
  return sha256(normalizeText(body))
}
