import 'server-only'

import type { RawItem } from '@/lib/crawler/types'
import { cleanBodyText, htmlToPlainText } from '@/lib/contents/clean-body'
import { fetchFeedText } from '@/lib/crawler/fetch-feed'
import type { Source } from '@/lib/types'

function decodeXml(value: string): string {
  return cleanBodyText(htmlToPlainText(value))
}

function getTag(block: string, tag: string): string | null {
  const escaped = tag.replace(':', '\\:')
  const match = block.match(new RegExp(`<${escaped}[^>]*>([\\s\\S]*?)<\\/${escaped}>`, 'i'))
  return match?.[1] ? decodeXml(match[1]) : null
}

/**
 * Google News Sitemap 규격의 url 항목을 기사 후보로 변환합니다.
 * 일반 Sitemap은 제목이 없으므로 후보를 만들지 않습니다.
 */
export async function fetchNewsSitemap(source: Source, since: string): Promise<RawItem[]> {
  const endpoint = source.rss_url || source.url
  if (!endpoint) return []

  const xml = await fetchFeedText(endpoint)
  const sinceMs = new Date(since).getTime()
  const items: RawItem[] = []

  for (const match of xml.matchAll(/<url\b[^>]*>([\s\S]*?)<\/url>/gi)) {
    const block = match[1]
    const originalUrl = getTag(block, 'loc')
    const title = getTag(block, 'news:title')
    const publishedRaw = getTag(block, 'news:publication_date') ?? getTag(block, 'lastmod')
    if (!originalUrl || !title || !publishedRaw) continue

    const publishedAt = new Date(publishedRaw)
    if (Number.isNaN(publishedAt.getTime()) || publishedAt.getTime() < sinceMs) continue

    items.push({
      original_url: originalUrl,
      title,
      published_at: publishedAt.toISOString(),
      language: 'ko',
    })
  }

  return items
}
