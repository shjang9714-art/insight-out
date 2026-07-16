import 'server-only'

import type { RawItem } from '../types'
import { getPublishedAtSince } from '@/lib/crawler/publication-date'
import { cleanBodyText, htmlToPlainText } from '@/lib/contents/clean-body'

/**
 * 네이버 전용 뉴스 수집기 — 검색 Open API news.json 재사용.
 * 기업자료 발견 커넥터(company-docs/discovery/naver.ts)와 동일 자격증명(NAVER_SEARCH_CLIENT_ID/SECRET),
 * 같은 계정 일일 25,000건 쿼터를 공유한다 — 쿼터 회계는 orchestrator 쪽(호출부)에서 두 provider
 * 합산으로 관리하고, 이 파일은 순수 fetch·파싱만 담당한다(다른 어댑터와 동일 역할 분리).
 */
const NAVER_NEWS_URL = 'https://openapi.naver.com/v1/search/news.json'
// 100 = 네이버 API display 파라미터 상한. 페이징(start) 없이 단일 호출로 최대치를 받는다 —
// display를 올려도 API 호출 횟수(=쿼터 소모)는 그대로 1건이라 상한까지 올리는 데 비용이 없다.
const DISPLAY_PER_QUERY = 100

interface NaverNewsItem {
  title?: unknown
  link?: unknown
  originallink?: unknown
  description?: unknown
  pubDate?: unknown
}

const HTML_ENTITIES: Record<string, string> = {
  '&quot;': '"', '&amp;': '&', '&lt;': '<', '&gt;': '>', '&#39;': "'",
}

function stripHtml(value: string): string {
  return value
    .replace(/<[^>]+>/g, '')
    .replace(/&quot;|&amp;|&lt;|&gt;|&#39;/g, (m) => HTML_ENTITIES[m] ?? m)
}

export interface NaverNewsCredentials {
  clientId: string
  clientSecret: string
}

/** 네이버 검색 news.json 1회 호출 → RawItem[] (since 이전 발행분은 제외). */
export async function fetchNaverNewsItems(
  query: string,
  since: string,
  { clientId, clientSecret }: NaverNewsCredentials
): Promise<RawItem[]> {
  const url = `${NAVER_NEWS_URL}?query=${encodeURIComponent(query)}&display=${DISPLAY_PER_QUERY}&sort=date`
  const res = await fetch(url, {
    headers: {
      'X-Naver-Client-Id': clientId,
      'X-Naver-Client-Secret': clientSecret,
    },
  })
  if (!res.ok) throw new Error(`네이버 뉴스 검색 API 오류 (${res.status})`)

  const data = await res.json() as { items?: NaverNewsItem[] }
  const items: RawItem[] = []

  for (const raw of data.items ?? []) {
    const link = typeof raw.originallink === 'string' && raw.originallink
      ? raw.originallink
      : (typeof raw.link === 'string' ? raw.link : '')
    if (!link) continue

    const title = stripHtml(typeof raw.title === 'string' ? raw.title : '')
    if (!title) continue

    const pubDateStr = typeof raw.pubDate === 'string' ? raw.pubDate : undefined
    const publishedAt = getPublishedAtSince(pubDateStr, since)
    if (!publishedAt) continue

    const rawDescription = typeof raw.description === 'string' ? raw.description : ''
    const body = rawDescription ? cleanBodyText(htmlToPlainText(stripHtml(rawDescription))) : ''

    items.push({
      original_url: link,
      title,
      body: body || undefined,
      published_at: publishedAt,
      language: 'ko',
    })
  }

  return items
}
