import 'server-only'
import { cleanBodyText, htmlToPlainText } from '@/lib/contents/clean-body'
import { stripSourceSuffix, titleSimilarity } from '@/lib/crawler/similarity'

const TITLE_SIMILARITY_THRESHOLD = 0.55
const NAVER_TITLE_SEARCH_LIMIT = 20

interface NaverTitleItem {
  title?: string
  originallink?: string
}

interface NaverTitleResponse {
  items?: NaverTitleItem[]
}

function isUsableOriginalUrl(value: string | undefined): value is string {
  if (!value) return false
  try {
    const parsed = new URL(value)
    return /^https?:$/.test(parsed.protocol) && !parsed.hostname.includes('google.')
  } catch {
    return false
  }
}

/**
 * Google News URL 디코드 실패 시 저장 제목으로 네이버 뉴스검색을 수행해 실제 원문을 찾는다.
 * 키 미설정·API 실패·유사 후보 없음은 모두 null로 끝내 기존 본문 보강 흐름을 방해하지 않는다.
 */
export async function findRealUrlByTitle(title: string): Promise<string | null> {
  const clientId = process.env.NAVER_CLIENT_ID ?? process.env.NAVER_SEARCH_CLIENT_ID
  const clientSecret = process.env.NAVER_CLIENT_SECRET ?? process.env.NAVER_SEARCH_CLIENT_SECRET
  const normalizedTitle = stripSourceSuffix(cleanBodyText(htmlToPlainText(title)))
  if (!clientId || !clientSecret || !normalizedTitle) return null

  try {
    const url = new URL('https://openapi.naver.com/v1/search/news.json')
    url.searchParams.set('query', normalizedTitle)
    url.searchParams.set('display', String(NAVER_TITLE_SEARCH_LIMIT))
    url.searchParams.set('start', '1')
    url.searchParams.set('sort', 'sim')

    const response = await fetch(url, {
      headers: {
        'X-Naver-Client-Id': clientId,
        'X-Naver-Client-Secret': clientSecret,
      },
      signal: AbortSignal.timeout(6000),
    })
    if (!response.ok) return null

    const payload = await response.json() as NaverTitleResponse
    let best: { url: string; score: number } | null = null

    for (const item of payload.items ?? []) {
      if (!isUsableOriginalUrl(item.originallink) || !item.title) continue
      const candidateTitle = stripSourceSuffix(cleanBodyText(htmlToPlainText(item.title)))
      const score = titleSimilarity(normalizedTitle, candidateTitle)
      if (score < TITLE_SIMILARITY_THRESHOLD || (best && score <= best.score)) continue
      best = { url: item.originallink, score }
    }

    return best?.url ?? null
  } catch {
    return null
  }
}
