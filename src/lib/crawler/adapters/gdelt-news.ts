import type { RawItem } from '../types'
import { cleanBodyText, htmlToPlainText } from '@/lib/contents/clean-body'

interface GdeltArticle { url?: string; title?: string; seendate?: string }
interface GdeltResponse { articles?: GdeltArticle[] }

export interface GdeltNewsFetchResult {
  items: RawItem[]
  status: 'success' | 'disabled' | 'failed'
  error?: string
}

function gdeltDate(value: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${value.getUTCFullYear()}${p(value.getUTCMonth() + 1)}${p(value.getUTCDate())}${p(value.getUTCHours())}${p(value.getUTCMinutes())}${p(value.getUTCSeconds())}`
}

export async function fetchGdeltNewsDetailed(
  query: string,
  since: string,
  opts: { maxRecords?: number } = {},
): Promise<GdeltNewsFetchResult> {
  if (process.env.GDELT_ENABLED === 'false') {
    return { items: [], status: 'disabled', error: 'GDELT 수집이 비활성화되어 있습니다.' }
  }
  const now = new Date()
  const threeMonthsAgo = new Date(now); threeMonthsAgo.setUTCMonth(threeMonthsAgo.getUTCMonth() - 3)
  const requestedSince = new Date(since)
  const start = Number.isNaN(requestedSince.getTime()) || requestedSince < threeMonthsAgo ? threeMonthsAgo : requestedSince
  const url = new URL('https://api.gdeltproject.org/api/v2/doc/doc')
  url.searchParams.set('query', `"${query}" sourcelang:korean`)
  url.searchParams.set('mode', 'ArtList'); url.searchParams.set('format', 'json'); url.searchParams.set('sort', 'DateDesc')
  url.searchParams.set('maxrecords', String(Math.min(opts.maxRecords ?? 100, 250)))
  url.searchParams.set('startdatetime', gdeltDate(start)); url.searchParams.set('enddatetime', gdeltDate(now))
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(10_000) })
    if (!response.ok) throw new Error(`GDELT API ${response.status}`)
    const payload = await response.json() as GdeltResponse
    const items: RawItem[] = []
    for (const article of payload.articles ?? []) {
      if (!article.url?.match(/^https?:\/\//i) || !article.title || !article.seendate) continue
      const date = new Date(article.seendate)
      if (Number.isNaN(date.getTime()) || date < start) continue
      const title = cleanBodyText(htmlToPlainText(article.title))
      if (!title) continue
      items.push({ original_url: article.url, title, published_at: date.toISOString(), language: 'ko' })
    }
    return { items, status: 'success' }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error(`[GDELT 뉴스] 검색 실패(query=${query}):`, message)
    return { items: [], status: 'failed', error: message }
  }
}

export async function fetchGdeltNews(
  query: string,
  since: string,
  opts: { maxRecords?: number } = {},
): Promise<RawItem[]> {
  const result = await fetchGdeltNewsDetailed(query, since, opts)
  return result.items
}
