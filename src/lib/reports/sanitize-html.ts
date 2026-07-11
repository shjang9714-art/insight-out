import 'server-only'
import sanitizeHtml from 'sanitize-html'

const ALLOWED_TAGS = [
  'h2', 'h3', 'h4', 'p', 'ul', 'ol', 'li', 'strong', 'em', 'b', 'i', 'br', 'hr',
  'blockquote', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'a', 'span',
]

/**
 * 전략보고서 body_html 렌더용 살균. 274 생성 시 1차 제거되지만 렌더 시 2차 방어(275).
 * script/iframe/style/on* 전면 차단, a 태그는 http/https href만 허용 + 새 탭 오픈.
 */
export function sanitizeReportHtml(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: {
      a: ['href', 'target', 'rel'],
    },
    allowedSchemes: ['http', 'https'],
    disallowedTagsMode: 'discard',
    transformTags: {
      a: sanitizeHtml.simpleTransform('a', { target: '_blank', rel: 'noopener noreferrer' }, true),
    },
  })
}
