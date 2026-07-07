const BOILERPLATE_PATTERNS = [
  /^(서비스 전체보기|위시켓|요즘IT|AIDP|고객 문의|이용약관|개인정보 처리방침|청소년보호정책)$/i,
  /^(슬랙봇|크롬 확장 프로그램|콘텐츠 제안하기|광고 상품 보기)$/i,
  /^(로그인|회원가입|메뉴|홈|회사소개|고객센터|사이트맵)$/i,
  /^(copyright|all rights reserved)/i,
]

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const PHONE_PATTERN = /^(?:전화|문의|대표전화|tel|fax)?\s*:?\s*\d{2,4}[-.)\s]\d{3,4}[-.\s]\d{4}$/i
const AD_LINE_PATTERN =
  /^(?:\[?(?:광고|ad|sponsored|협찬|프로모션)\]?[\s:]|이 글은.*제공|바로가기.*클릭)/i

function decodeEntities(text: string): string {
  return text
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
}

function isJunkLine(line: string): boolean {
  if (BOILERPLATE_PATTERNS.some((pattern) => pattern.test(line))) return true
  if (line.length <= 80 && (EMAIL_PATTERN.test(line) || PHONE_PATTERN.test(line))) {
    return true
  }
  return line.length <= 80 && AD_LINE_PATTERN.test(line)
}

export function htmlToPlainText(html: string): string {
  return decodeEntities(
    html
      .replace(/<(script|style|noscript|svg|picture|figure)\b[^>]*>[\s\S]*?<\/\1>/gi, '\n')
      .replace(/<img\b[^>]*>/gi, '\n')
      .replace(/<\/?(p|div|br|h[1-6]|li|tr|td|th|section|article)[^>]*>/gi, '\n')
      .replace(/<[^>]+>/g, ''),
  )
}

/**
 * 마크다운 원본 → 평문(212). 검색·스니펫·body_original 용도라 완벽한 파싱은 불필요,
 * 헤딩/강조/목록/인용/링크/코드 표기만 제거해 읽을 만한 평문을 만든다.
 */
export function stripMarkdown(md: string): string {
  return md
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^>\s?/gm, '')
    .replace(/^[-*+]\s+/gm, '')
    .replace(/^\d+\.\s+/gm, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/`{1,3}([^`]*)`{1,3}/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/_([^_]+)_/g, '$1')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export function cleanBodyText(text: string): string {
  const normalized = decodeEntities(text)
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)

  const cleaned = normalized.filter((line) => !isJunkLine(line)).join('\n\n')
  const original = normalized.join('\n\n')

  if (cleaned.length < 120 || cleaned.length < original.length * 0.25) {
    return original
  }
  return cleaned
}
