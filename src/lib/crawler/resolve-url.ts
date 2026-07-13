import 'server-only'
import { normalizeUrl } from './normalize'

const GOOGLE_NEWS_DECODE_ENDPOINT = 'https://news.google.com/_/DotsSplashUi/data/batchexecute'

/** `.../rss/articles/<base64>` 또는 `.../articles/<base64>` 경로의 마지막 세그먼트 추출. */
function extractGoogleNewsBase64(url: string): string | null {
  try {
    const segments = new URL(url).pathname.split('/').filter(Boolean)
    const last = segments[segments.length - 1]
    return last || null
  } catch {
    return null
  }
}

/**
 * 구글뉴스 신규 인코딩 URL(news.google.com/rss/articles/CBMi...)은 서버 301/302 리다이렉트를
 * 하지 않고 클라이언트 JS 로 원문 URL을 디코드하기 때문에, fetch redirect follow 만으로는
 * 최종 URL이 여전히 google 도메인으로 남는다(실측 확인, 2026-07-13 — 오늘 수집 115건이
 * 전부 이 경로로 body_short에 갇힘). 기사 페이지 HTML에 박힌 signature(data-n-a-sg)·
 * timestamp(data-n-a-ts)를 구글 내부 batchexecute 엔드포인트(Fbv4je RPC)로 보내 실제
 * 원문 URL을 받아온다. 실패·형식 불일치·google 도메인 반환 시 null(throw 금지) — 호출부가
 * 원본 URL로 폴백.
 */
async function decodeGoogleNewsUrl(url: string, html: string): Promise<string | null> {
  try {
    const base64Str = extractGoogleNewsBase64(url)
    if (!base64Str) return null

    const signature = html.match(/data-n-a-sg="([^"]+)"/)?.[1]
    const timestamp = html.match(/data-n-a-ts="([^"]+)"/)?.[1]
    if (!signature || !timestamp) return null

    const innerReq = JSON.stringify([
      'garturlreq',
      [
        ['X', 'X', ['X', 'X'], null, null, 1, 1, 'US:en', null, 1, null, null, null, null, null, 0, 1],
        'X', 'X', 1, [1, 1, 1], 1, 1, null, 0, 0, null, 0,
      ],
      base64Str, timestamp, signature,
    ])
    const freq = JSON.stringify([[['Fbv4je', innerReq, null, 'generic']]])

    const res = await fetch(GOOGLE_NEWS_DECODE_ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded;charset=UTF-8' },
      body: 'f.req=' + encodeURIComponent(freq),
      signal: AbortSignal.timeout(6000),
    })
    if (!res.ok) return null

    // 응답 형식: )]}'\n\n[[...]] — 첫 줄(안티 하이재킹 프리픽스) 건너뛰고 파싱.
    const lines = (await res.text()).split('\n\n')
    if (lines.length < 2) return null
    const parsed = JSON.parse(lines[1])
    const inner = JSON.parse(parsed[0][2])
    const decoded = inner?.[1]
    if (typeof decoded !== 'string') return null
    if (new URL(decoded).hostname.includes('google.')) return null

    return decoded
  } catch {
    return null
  }
}

/**
 * Google News 리다이렉트 URL 을 실제 원문 URL 로 해소한다.
 * - `news.google.com` 이 아니면 그대로 반환.
 * - fetch redirect follow 후 최종 URL 이 google 도메인이 아니면 그것 반환(구버전 인코딩).
 * - 여전히 google 도메인이면(신규 인코딩) batchexecute 디코드 시도.
 * - 실패·타임아웃 모두 원본 url 반환(throw 금지).
 */
export async function resolveArticleUrl(url: string): Promise<string> {
  try {
    const host = new URL(url).hostname
    if (!host.includes('news.google.com')) return url

    const res = await fetch(url, {
      redirect: 'follow',
      signal: AbortSignal.timeout(5000),
    })
    const finalUrl = res.url
    if (finalUrl && !new URL(finalUrl).hostname.includes('google.')) {
      return finalUrl
    }

    const html = await res.text()
    const decoded = await decodeGoogleNewsUrl(url, html)
    if (decoded) return decoded

    return url
  } catch {
    return url
  }
}

/**
 * 원문 URL 해소(196) — resolveArticleUrl 결과를 normalizeUrl 로 표준화해 canonical_url 로 사용.
 * 실패 시에도 normalizeUrl(originalUrl) 반환(throw 금지, resolveArticleUrl 자체가 이미 실패-안전).
 */
export async function resolveCanonical(originalUrl: string): Promise<string> {
  const resolved = await resolveArticleUrl(originalUrl)
  return normalizeUrl(resolved)
}
