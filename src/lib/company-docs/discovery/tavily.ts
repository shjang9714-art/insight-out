import 'server-only'

import {
  readQuotaCalls,
  recordQuotaCalls,
  thisMonthKst,
  type Candidate,
  type DiscoveryProvider,
  type DiscoveryResult,
} from './types'

// Tavily — 어드민 수동 트리거 전용(자동 크론 금지). 월 1,000 크레딧 계정 기준.
const TAVILY_URL = 'https://api.tavily.com/search'
const QUOTA_PROVIDER = 'tavily-discovery'
export const TAVILY_MONTHLY_QUOTA = 1_000

interface TavilyResultItem {
  title?: unknown
  url?: unknown
  content?: unknown
}

export const tavilyProvider: DiscoveryProvider = {
  key: 'tavily',

  async search({ entityName, query, admin }): Promise<DiscoveryResult> {
    const apiKey = process.env.TAVILY_API_KEY?.trim()
    if (!apiKey) {
      return {
        candidates: [],
        skipped: true,
        message: 'TAVILY_API_KEY가 설정되지 않아 Tavily 탐색을 실행하지 않았습니다.',
      }
    }
    const prompt = query?.trim()
    if (!prompt) {
      return { candidates: [], skipped: true, message: '탐색할 프롬프트를 입력해주세요.' }
    }

    const period = thisMonthKst()
    const used = await readQuotaCalls(admin, QUOTA_PROVIDER, period)
    if (used + 1 > TAVILY_MONTHLY_QUOTA) {
      return {
        candidates: [],
        skipped: true,
        message: `Tavily 이번 달 크레딧(${TAVILY_MONTHLY_QUOTA.toLocaleString()}건)에 근접해 실행하지 않았습니다. (이번 달 사용 ${used.toLocaleString()}건)`,
      }
    }

    let res: Response
    try {
      res = await fetch(TAVILY_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          api_key: apiKey,
          query: `${entityName} ${prompt}`,
          search_depth: 'advanced',
          max_results: 10,
        }),
      })
    } finally {
      // 요청이 성공하든 실패하든(네트워크 오류 포함) 크레딧 1건은 사용된 것으로 보수적으로 기록.
      await recordQuotaCalls(admin, QUOTA_PROVIDER, period, 1)
    }

    if (!res.ok) throw new Error(`Tavily API 오류 (${res.status})`)
    const data = await res.json() as { results?: TavilyResultItem[] }

    const candidates: Candidate[] = (data.results ?? [])
      .filter((item): item is Required<Pick<TavilyResultItem, 'url' | 'title'>> & TavilyResultItem =>
        typeof item.url === 'string' && typeof item.title === 'string')
      .map((item) => ({
        url: item.url as string,
        title: item.title as string,
        snippet: typeof item.content === 'string' ? item.content : undefined,
        source_kind: 'API',
        entity_hint: entityName,
        provider: 'tavily',
      }))

    return {
      candidates,
      skipped: false,
      message: candidates.length === 0 ? '조건에 맞는 자료 후보를 찾지 못했습니다.' : null,
    }
  },
}

export async function readTavilyQuota(admin: Parameters<typeof readQuotaCalls>[0]): Promise<{ used: number; limit: number }> {
  const used = await readQuotaCalls(admin, QUOTA_PROVIDER, thisMonthKst())
  return { used, limit: TAVILY_MONTHLY_QUOTA }
}
