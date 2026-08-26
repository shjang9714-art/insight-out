// 지시서 20260827 — 근거기사 화면 렌더 dedup. daily_insights.source_articles 원본(jsonb)은
// 절대 건드리지 않는다(UPDATE/DELETE 금지) — 화면에 뿌리기 직전에만 중복을 걷어낸다.
// 같은 인사이트 1건 안에서의 중복만 대상(인사이트끼리 겹치는 건 범위 밖).
// dedup 키 우선순위: content_id > 정규화 URL > 정규화 제목. 완전 일치만 중복으로 본다 —
// 유사도(자카드 등) 판정은 쓰지 않는다(다른 사건이 잘못 합쳐질 위험이 더 큼).
// 배열 순서를 보존하며, 이미 본 키가 다시 나오면 버린다(= 가장 먼저 나온 항목만 남김).

export interface DedupableSourceArticle {
  content_id?: string | null
  url?: string | null
  title?: string | null
}

const TRACKING_PARAM_NAMES = new Set(['fbclid', 'gclid', 'ref', 'from', 'sid'])

function isTrackingParam(key: string): boolean {
  return key.startsWith('utm_') || TRACKING_PARAM_NAMES.has(key)
}

/** URL 정규화 — 프로토콜/www/추적 파라미터/끝 슬래시·해시 무시. 파싱 실패 시 원문 소문자·trim만. */
function normalizeUrl(url: string): string {
  const trimmed = url.trim().toLowerCase()
  if (!trimmed) return trimmed
  try {
    const parsed = new URL(trimmed)
    const host = parsed.hostname.replace(/^www\./, '')
    const keysToDelete: string[] = []
    parsed.searchParams.forEach((_, key) => {
      if (isTrackingParam(key)) keysToDelete.push(key)
    })
    keysToDelete.forEach((key) => parsed.searchParams.delete(key))
    const search = parsed.searchParams.toString()
    const pathname = parsed.pathname.replace(/\/+$/, '')
    return `${host}${pathname}${search ? `?${search}` : ''}`
  } catch {
    return trimmed
  }
}

const TITLE_PUNCTUATION_RE = /["'“”‘’[\]()<>·,.…\-–—]/g

/** 제목 정규화 — 매체 접미사(`- 매체`/`| 매체`/`[매체]`) 제거 후 구두점·공백 정리. */
function normalizeTitle(title: string): string {
  let t = title.trim()
  t = t.replace(/\s*\[[^[\]]{1,40}\]\s*$/, '')
  t = t.replace(/\s*[-|–—]\s*[^-|–—]{1,40}$/, '')
  t = t.toLowerCase()
  t = t.replace(TITLE_PUNCTUATION_RE, ' ')
  t = t.replace(/\s+/g, ' ').trim()
  return t
}

/**
 * 판정에 쓸 키 목록을 만든다. content_id와 정규화 URL은 "둘 다 있으면 둘 다" 등록·비교한다 —
 * content_id가 서로 달라도 정규화 URL이 같으면 중복으로 잡기 위함(재크롤링으로 content_id만
 * 새로 발급된 케이스 등). 제목 키는 content_id/URL이 하나도 없을 때만 쓰는 최후 폴백이며,
 * 다른 두 키와 섞어 비교하지 않는다 — 유사도 판정으로 새는 걸 막기 위해 완전 일치만 허용.
 */
function buildDedupKeys(article: DedupableSourceArticle): string[] {
  const keys: string[] = []
  if (article.content_id) keys.push(`id:${article.content_id}`)
  if (article.url) {
    const normalized = normalizeUrl(article.url)
    if (normalized) keys.push(`url:${normalized}`)
  }
  if (keys.length === 0 && article.title) {
    const normalized = normalizeTitle(article.title)
    if (normalized) keys.push(`title:${normalized}`)
  }
  return keys
}

/**
 * 근거기사 배열에서 화면 노출용 중복만 제거한 새 배열을 반환한다(원본 비변경, 순수 함수).
 * dedup 키가 전혀 없는 항목(content_id/url/title 모두 없음)은 판정 없이 그대로 남긴다.
 * null/빈 배열/필드 누락에 안전하며 어떤 입력에도 throw 하지 않는다.
 */
export function dedupeSourceArticles<T extends DedupableSourceArticle>(
  articles: readonly T[] | null | undefined
): T[] {
  if (!articles || articles.length === 0) return []

  const seen = new Set<string>()
  const result: T[] = []

  for (const article of articles) {
    if (!article) continue
    const keys = buildDedupKeys(article)
    if (keys.length === 0) {
      result.push(article)
      continue
    }
    if (keys.some((key) => seen.has(key))) continue
    keys.forEach((key) => seen.add(key))
    result.push(article)
  }

  return result
}
