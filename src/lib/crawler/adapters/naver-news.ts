import type { RawItem } from '../types'
import { cleanBodyText, htmlToPlainText } from '@/lib/contents/clean-body'

interface NaverItem { title?: string; originallink?: string; link?: string; description?: string; pubDate?: string }
interface NaverResponse { items?: NaverItem[] }

export async function fetchNaverNews(query: string, since: string, opts: { maxItems?: number } = {}): Promise<RawItem[]> {
  const clientId = process.env.NAVER_CLIENT_ID
  const clientSecret = process.env.NAVER_CLIENT_SECRET
  if (!clientId || !clientSecret) return []
  const maxItems = Math.min(opts.maxItems ?? 200, 300)
  const items: RawItem[] = []
  try {
    for (let start = 1; start <= Math.min(1000, maxItems); start += 100) {
      const display = Math.min(100, maxItems - items.length)
      if (display <= 0) break
      const url = new URL('https://openapi.naver.com/v1/search/news.json')
      url.searchParams.set('query', query); url.searchParams.set('display', String(display)); url.searchParams.set('start', String(start)); url.searchParams.set('sort', 'date')
      const response = await fetch(url, { headers: { 'X-Naver-Client-Id': clientId, 'X-Naver-Client-Secret': clientSecret }, signal: AbortSignal.timeout(10_000) })
      if (!response.ok) throw new Error(`Naver API ${response.status}`)
      const payload = await response.json() as NaverResponse
      const page = payload.items ?? []
      if (!page.length) break
      let older = false
      for (const item of page) {
        const date = item.pubDate ? new Date(item.pubDate) : null
        if (!date || Number.isNaN(date.getTime())) continue
        if (date.toISOString() < since) { older = true; continue }
        const originalUrl = item.originallink || item.link
        const title = item.title ? cleanBodyText(htmlToPlainText(item.title)) : ''
        if (!originalUrl || !title) continue
        items.push({ original_url: originalUrl, title, body: item.description ? cleanBodyText(htmlToPlainText(item.description)) : undefined, published_at: date.toISOString(), language: 'ko' })
      }
      if (older || page.length < display) break
    }
  } catch (error) {
    console.error(`[네이버 뉴스] 검색 실패(query=${query}):`, error instanceof Error ? error.message : String(error))
  }
  return items
}
