import 'server-only'

/**
 * Google News 리다이렉트 URL 을 실제 원문 URL 로 해소한다.
 * - `news.google.com` 이 아니면 그대로 반환.
 * - fetch redirect follow 후 최종 URL 이 google 도메인이 아니면 그것 반환.
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
    return url
  } catch {
    return url
  }
}
