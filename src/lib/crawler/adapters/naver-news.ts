import type { RawItem } from '../types'
import { cleanBodyText, htmlToPlainText } from '@/lib/contents/clean-body'

interface NaverItem { title?: string; originallink?: string; link?: string; description?: string; pubDate?: string }
interface NaverResponse { items?: NaverItem[] }

export type NaverNewsApiMode = 'api_hub' | 'legacy' | 'disabled'

export interface NaverNewsFetchResult {
  items: RawItem[]
  mode: NaverNewsApiMode
  error?: string
}

interface NaverNewsApiConfig {
  mode: Exclude<NaverNewsApiMode, 'disabled'>
  endpoint: string
  headers: Record<string, string>
}

function getNaverNewsApiConfig(): NaverNewsApiConfig | null {
  const apiHubClientId = process.env.NAVER_API_HUB_CLIENT_ID
  const apiHubClientSecret = process.env.NAVER_API_HUB_CLIENT_SECRET
  if (apiHubClientId && apiHubClientSecret) {
    return {
      mode: 'api_hub',
      endpoint: 'https://naverapihub.apigw.ntruss.com/search/v1/news',
      headers: {
        'X-NCP-APIGW-API-KEY-ID': apiHubClientId,
        'X-NCP-APIGW-API-KEY': apiHubClientSecret,
      },
    }
  }

  // 기존 신청 앱의 단계적 이전을 위한 임시 호환 경로입니다.
  const legacyClientId = process.env.NAVER_CLIENT_ID
  const legacyClientSecret = process.env.NAVER_CLIENT_SECRET
  if (legacyClientId && legacyClientSecret) {
    return {
      mode: 'legacy',
      endpoint: 'https://openapi.naver.com/v1/search/news.json',
      headers: {
        'X-Naver-Client-Id': legacyClientId,
        'X-Naver-Client-Secret': legacyClientSecret,
      },
    }
  }

  return null
}

export async function fetchNaverNewsDetailed(
  query: string,
  since: string,
  opts: { maxItems?: number } = {},
): Promise<NaverNewsFetchResult> {
  const config = getNaverNewsApiConfig()
  if (!config) {
    return {
      items: [],
      mode: 'disabled',
      error: 'NAVER API HUB 인증 정보가 설정되지 않았습니다.',
    }
  }

  const maxItems = Math.min(opts.maxItems ?? 200, 300)
  const items: RawItem[] = []
  try {
    for (let start = 1; start <= Math.min(1000, maxItems); start += 100) {
      const display = Math.min(100, maxItems - items.length)
      if (display <= 0) break
      const url = new URL(config.endpoint)
      url.searchParams.set('query', query); url.searchParams.set('display', String(display)); url.searchParams.set('start', String(start)); url.searchParams.set('sort', 'date')
      const response = await fetch(url, {
        headers: config.headers,
        signal: AbortSignal.timeout(10_000),
      })
      if (!response.ok) throw new Error(`NAVER 뉴스 API HTTP ${response.status}`)
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
    const message = error instanceof Error ? error.message : String(error)
    console.error(`[네이버 뉴스] 검색 실패(query=${query}, mode=${config.mode}):`, message)
    return { items, mode: config.mode, error: message }
  }
  return { items, mode: config.mode }
}

export async function fetchNaverNews(
  query: string,
  since: string,
  opts: { maxItems?: number } = {},
): Promise<RawItem[]> {
  const result = await fetchNaverNewsDetailed(query, since, opts)
  return result.items
}
