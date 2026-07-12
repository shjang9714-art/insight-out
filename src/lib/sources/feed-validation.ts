import 'server-only'

import { fetchFeedText } from '@/lib/crawler/fetch-feed'
import { parseNewsSiteFeedXml } from '@/lib/crawler/adapters/news-site'

const VALIDATION_SINCE = '1970-01-01T00:00:00.000Z'

export interface FeedValidationResult {
  ok: boolean
  httpStatus: number | null
  itemCount: number
  latestPublishedAt: string | null
  sampleTitles: string[]
  error: string | null
}

function emptyResult(error: string, httpStatus: number | null = null): FeedValidationResult {
  return {
    ok: false,
    httpStatus,
    itemCount: 0,
    latestPublishedAt: null,
    sampleTitles: [],
    error,
  }
}

function parseHttpStatus(message: string): number | null {
  const match = message.match(/피드 HTTP (\d{3})/)
  return match ? Number(match[1]) : null
}

function classifyFetchError(error: unknown): FeedValidationResult {
  if (error instanceof Error) {
    const status = parseHttpStatus(error.message)
    if (status) return emptyResult(`http_${status}`, status)
    if (error.name === 'AbortError' || error.name === 'TimeoutError') {
      return emptyResult('timeout')
    }
  }
  return emptyResult('fetch_failed')
}

export async function validateFeedUrl(
  url: string,
  timeoutMs = 10_000,
): Promise<FeedValidationResult> {
  let parsedUrl: URL
  try {
    parsedUrl = new URL(url)
  } catch {
    return emptyResult('invalid_url')
  }

  if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
    return emptyResult('invalid_url')
  }

  let xml: string
  try {
    xml = await fetchFeedText(parsedUrl.toString(), timeoutMs)
  } catch (error) {
    return classifyFetchError(error)
  }

  try {
    const items = await parseNewsSiteFeedXml(xml, VALIDATION_SINCE)
    if (items.length === 0) return emptyResult('no_items', 200)

    const latestPublishedAt = items.reduce<string | null>((latest, item) => {
      if (!item.published_at) return latest
      if (!latest) return item.published_at
      return new Date(item.published_at).getTime() > new Date(latest).getTime()
        ? item.published_at
        : latest
    }, null)

    return {
      ok: true,
      httpStatus: 200,
      itemCount: items.length,
      latestPublishedAt,
      sampleTitles: items.slice(0, 3).map((item) => item.title),
      error: null,
    }
  } catch {
    return emptyResult('not_xml', 200)
  }
}
