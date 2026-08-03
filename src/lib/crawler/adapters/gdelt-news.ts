import type { RawItem } from '../types'
import { cleanBodyText, htmlToPlainText } from '@/lib/contents/clean-body'

interface GdeltArticle { url?: string; title?: string; seendate?: string }
interface GdeltResponse { articles?: GdeltArticle[] }

function gdeltDate(value: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${value.getUTCFullYear()}${p(value.getUTCMonth() + 1)}${p(value.getUTCDate())}${p(value.getUTCHours())}${p(value.getUTCMinutes())}${p(value.getUTCSeconds())}`
}

/** GDELT DOC API의 seendate 전용 형식(YYYYMMDDTHHMMSSZ)을 UTC Date로 변환한다. */
export function parseGdeltSeenDate(value: string | undefined): Date | null {
  if (!value) return null
  const match = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(value)
  if (!match) return null

  const [, year, month, day, hour, minute, second] = match
  const date = new Date(Date.UTC(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    Number(second)
  ))

  // Date.UTC의 월·일 overflow 보정을 허용하지 않고 원본 값과 정확히 일치할 때만 인정한다.
  if (
    date.getUTCFullYear() !== Number(year) ||
    date.getUTCMonth() !== Number(month) - 1 ||
    date.getUTCDate() !== Number(day) ||
    date.getUTCHours() !== Number(hour) ||
    date.getUTCMinutes() !== Number(minute) ||
    date.getUTCSeconds() !== Number(second)
  ) {
    return null
  }

  return date
}

export async function fetchGdeltNews(query: string, since: string, opts: { maxRecords?: number } = {}): Promise<RawItem[]> {
  if (process.env.GDELT_ENABLED === 'false') return []
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
      const date = parseGdeltSeenDate(article.seendate)
      if (!date || date < start) continue
      const title = cleanBodyText(htmlToPlainText(article.title))
      if (!title) continue
      items.push({ original_url: article.url, title, published_at: date.toISOString(), language: 'ko' })
    }
    return items
  } catch (error) {
    console.error(`[GDELT 뉴스] 검색 실패(query=${query}):`, error instanceof Error ? error.message : String(error))
    return []
  }
}
