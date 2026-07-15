import 'server-only'

import type { CompanyDocumentType } from '@/lib/types'
import {
  readQuotaCalls,
  recordQuotaCalls,
  todayKst,
  type Candidate,
  type DiscoveryProvider,
  type DiscoveryResult,
} from './types'

// 네이버 검색 open API — 웹문서(webkr) · 뉴스(news). 앱당 일일 25,000건 공용 쿼터.
const NAVER_WEBKR_URL = 'https://openapi.naver.com/v1/search/webkr.json'
const NAVER_NEWS_URL = 'https://openapi.naver.com/v1/search/news.json'
const QUOTA_PROVIDER = 'naver-discovery'
export const NAVER_DAILY_QUOTA = 25_000

const HINTS: { suffix: string; docType: CompanyDocumentType }[] = [
  { suffix: '회사소개서', docType: '회사소개' },
  { suffix: 'IR 자료', docType: 'IR·실적' },
  { suffix: '기술백서', docType: '기술·제품' },
  { suffix: '지속가능경영보고서', docType: 'ESG' },
]
const ENDPOINTS = [NAVER_WEBKR_URL, NAVER_NEWS_URL]
const CALLS_PER_SEARCH = HINTS.length * ENDPOINTS.length

// PDF 확장자 또는 IR/자료실 경로 휴리스틱 — 실제 자료 후보만 걸러낸다.
const CANDIDATE_LINK_PATTERN = /\.pdf(?:[?#]|$)|\/(?:ir|pr|investor|download|자료실|공시|보도자료)\//i

const HTML_ENTITIES: Record<string, string> = {
  '&quot;': '"', '&amp;': '&', '&lt;': '<', '&gt;': '>', '&#39;': "'",
}

function stripHtml(value: string): string {
  return value
    .replace(/<[^>]+>/g, '')
    .replace(/&quot;|&amp;|&lt;|&gt;|&#39;/g, (m) => HTML_ENTITIES[m] ?? m)
}

interface NaverItem {
  title?: unknown
  link?: unknown
  description?: unknown
}

// 같은 쿼리는 24시간 재사용 — 워커 인스턴스가 살아있는 동안만 유효한 best-effort 캐시.
// (신규 SQL 없이 구현 — 콜드스타트 시 캐시는 비워지고 쿼터 카운터만 신뢰 가능한 상한선 역할을 한다.)
const CACHE_TTL_MS = 24 * 60 * 60 * 1000
const queryCache = new Map<string, { at: number; items: NaverItem[] }>()

async function callNaver(
  endpoint: string,
  query: string,
  clientId: string,
  clientSecret: string,
): Promise<NaverItem[]> {
  const cacheKey = `${endpoint}::${query}`
  const cached = queryCache.get(cacheKey)
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.items

  const url = `${endpoint}?query=${encodeURIComponent(query)}&display=10`
  const res = await fetch(url, {
    headers: {
      'X-Naver-Client-Id': clientId,
      'X-Naver-Client-Secret': clientSecret,
    },
  })
  if (!res.ok) throw new Error(`네이버 검색 API 오류 (${res.status})`)
  const data = await res.json() as { items?: NaverItem[] }
  const items = data.items ?? []
  queryCache.set(cacheKey, { at: Date.now(), items })
  return items
}

export const naverProvider: DiscoveryProvider = {
  key: 'naver',

  async search({ entityName, admin }): Promise<DiscoveryResult> {
    const clientId = process.env.NAVER_SEARCH_CLIENT_ID?.trim()
    const clientSecret = process.env.NAVER_SEARCH_CLIENT_SECRET?.trim()
    if (!clientId || !clientSecret) {
      return {
        candidates: [],
        skipped: true,
        message: 'NAVER_SEARCH_CLIENT_ID/NAVER_SEARCH_CLIENT_SECRET이 설정되지 않아 네이버 검색을 실행하지 않았습니다.',
      }
    }

    const period = todayKst()
    const used = await readQuotaCalls(admin, QUOTA_PROVIDER, period)
    if (used + CALLS_PER_SEARCH > NAVER_DAILY_QUOTA) {
      return {
        candidates: [],
        skipped: true,
        message: `네이버 검색 일일 쿼터(${NAVER_DAILY_QUOTA.toLocaleString()}건)에 근접해 실행하지 않았습니다. (오늘 사용 ${used.toLocaleString()}건)`,
      }
    }

    const candidates: Candidate[] = []
    const seenLinks = new Set<string>()
    let callCount = 0

    for (const hint of HINTS) {
      const query = `${entityName} ${hint.suffix}`
      for (const endpoint of ENDPOINTS) {
        try {
          const items = await callNaver(endpoint, query, clientId, clientSecret)
          callCount += 1
          for (const item of items) {
            const link = typeof item.link === 'string' ? item.link : ''
            if (!link || seenLinks.has(link) || !CANDIDATE_LINK_PATTERN.test(link)) continue
            seenLinks.add(link)
            candidates.push({
              url: link,
              title: stripHtml(typeof item.title === 'string' ? item.title : link),
              snippet: stripHtml(typeof item.description === 'string' ? item.description : ''),
              source_kind: 'API',
              entity_hint: entityName,
              doc_type_hint: hint.docType,
              provider: 'naver',
            })
          }
        } catch (err) {
          console.error(`[기업자료/네이버] 검색 실패 (${query}):`, err)
        }
      }
    }

    await recordQuotaCalls(admin, QUOTA_PROVIDER, period, callCount)

    return {
      candidates,
      skipped: false,
      message: candidates.length === 0 ? '조건에 맞는 자료 후보를 찾지 못했습니다.' : null,
    }
  },
}

export async function readNaverQuota(admin: Parameters<typeof readQuotaCalls>[0]): Promise<{ used: number; limit: number }> {
  const used = await readQuotaCalls(admin, QUOTA_PROVIDER, todayKst())
  return { used, limit: NAVER_DAILY_QUOTA }
}
