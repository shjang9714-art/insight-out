const BOILERPLATE_PATTERNS = [
  /^(서비스 전체보기|위시켓|요즘IT|AIDP|고객 문의|이용약관|개인정보 처리방침|청소년보호정책)$/i,
  /^(슬랙봇|크롬 확장 프로그램|콘텐츠 제안하기|광고 상품 보기)$/i,
  /^(로그인|회원가입|메뉴|홈|회사소개|고객센터|사이트맵)$/i,
  /^(copyright|all rights reserved)/i,
  // 267 — 구독·반응·추천 위젯 잔여 라인(정확 일치만, 과도 제거 방지)
  /^(구독|좋아요|슬퍼요|화나요|후속기사 원해요|쏠쏠정보|굿아이디어)$/,
  /^\d+개$/,
  /^이런 구독물도 추천합니다!?$/,
  /^지금 뜨는 뉴스$/,
  /^Tech&\s*>?$/,
]

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const PHONE_PATTERN = /^(?:전화|문의|대표전화|tel|fax)?\s*:?\s*\d{2,4}[-.)\s]\d{3,4}[-.\s]\d{4}$/i
const AD_LINE_PATTERN =
  /^(?:\[?(?:광고|ad|sponsored|협찬|프로모션)\]?[\s:]|이 글은.*제공|바로가기.*클릭)/i

// 267 — 본문 뒤 사이트 푸터(구독·반응·추천 위젯) 절단용 마커
const FOOTER_MARKER_PATTERNS = [
  /이런\s*구독물도\s*추천합니다/,
  /지금\s*뜨는\s*뉴스/,
  /^(무단전재|재배포\s*금지|ⓒ|Copyright\s*ⓒ)/i,
]
const REACTION_WORDS = new Set(['좋아요', '슬퍼요', '화나요', '후속기사 원해요'])
const REACTION_COUNT_PATTERN = /^\d+개$/

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

/**
 * 267 — lines(빈 줄 제거·trim 완료) 중 신뢰도 높은 푸터 시작 마커를 찾는다.
 * 본문 초반(minIndex 미만)의 마커는 오탐 위험이 커 무시하고 라인필터(isJunkLine)에 위임한다.
 */
function findFooterMarkerIndex(lines: string[], minIndex: number): number {
  for (let i = minIndex; i < lines.length; i++) {
    const line = lines[i]
    if (FOOTER_MARKER_PATTERNS.some((pattern) => pattern.test(line))) return i
    if (REACTION_WORDS.has(line)) {
      const prev = lines[i - 1]
      const next = lines[i + 1]
      if ((prev && REACTION_COUNT_PATTERN.test(prev)) || (next && REACTION_COUNT_PATTERN.test(next))) {
        return i
      }
    }
  }
  return -1
}

/** 267 — 푸터 마커 지점부터 끝까지 절단. 남는 본문이 너무 짧으면(오절단 위험) 절단 취소. */
function truncateFooter(lines: string[]): string[] {
  if (lines.length === 0) return lines

  const minIndex = Math.ceil(lines.length * 0.4)
  const markerIndex = findFooterMarkerIndex(lines, minIndex)
  if (markerIndex === -1) return lines

  const truncated = lines.slice(0, markerIndex)
  const truncatedLen = truncated.join('\n\n').length
  const originalLen = lines.join('\n\n').length
  if (truncatedLen < 120 || truncatedLen < originalLen * 0.3) {
    return lines
  }
  return truncated
}

export function cleanBodyText(text: string): string {
  const normalized = decodeEntities(text)
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)

  const original = normalized.join('\n\n')
  const withoutFooter = truncateFooter(normalized)
  const cleaned = withoutFooter.filter((line) => !isJunkLine(line)).join('\n\n')

  if (cleaned.length < 120 || cleaned.length < original.length * 0.25) {
    return original
  }
  return cleaned
}
