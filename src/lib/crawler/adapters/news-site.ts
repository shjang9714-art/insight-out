import Parser from 'rss-parser'
import type { SourceAdapter, RawItem } from '../types'
import type { Source } from '@/lib/types'

// rss-parser 커스텀 필드 포함 아이템 타입
type RssItem = Parser.Item & {
  creator?: string
  'dc:creator'?: string
  author?: string
  mediaContent?: { $?: { url?: string } }
  mediaThumbnail?: { $?: { url?: string } }
}

const parser = new Parser<Record<string, unknown>, RssItem>({
  customFields: {
    item: [
      ['media:content', 'mediaContent'],
      ['media:thumbnail', 'mediaThumbnail'],
      ['dc:creator', 'creator'],
    ],
  },
})

/** 제목·본문에 한글 포함 여부로 언어 추론 */
function detectLanguage(text: string): string {
  return /[가-힣]/.test(text) ? 'ko' : 'en'
}

/** 다양한 RSS 포맷에서 썸네일 URL 추출 */
function extractThumbnail(item: RssItem): string | undefined {
  // enclosure (표준 미디어 첨부)
  if (item.enclosure?.url) return item.enclosure.url
  // media:content
  if (item.mediaContent?.$?.url) return item.mediaContent.$.url
  // media:thumbnail
  if (item.mediaThumbnail?.$?.url) return item.mediaThumbnail.$.url
  return undefined
}

const newsSiteAdapter: SourceAdapter = {
  type: 'news_site',

  async fetch(source: Source, since: string): Promise<RawItem[]> {
    if (!source.rss_url) {
      console.warn(`[크롤러] 소스 "${source.name}"에 rss_url이 없습니다. 수집 건너뜀.`)
      return []
    }

    const feed = await parser.parseURL(source.rss_url)
    const sinceDate = new Date(since)
    const items: RawItem[] = []

    for (const item of feed.items) {
      // 발행일 필터: since 이전 발행분 제외 (발행일 없으면 보수적으로 포함)
      const pubDateStr = item.isoDate ?? item.pubDate
      if (pubDateStr) {
        const pubDate = new Date(pubDateStr)
        if (!isNaN(pubDate.getTime()) && pubDate < sinceDate) continue
      }

      const originalUrl = item.link ?? item.guid
      if (!originalUrl) continue

      // 본문은 RSS 제공분(content > snippet)만 사용.
      // 풀페이지 본문 추출은 기사마다 외부 fetch 가 필요해 서버리스 타임아웃을 유발 →
      // 수집 핫패스에서 제외. 풀본문은 후속 enrichment 단계로 분리(별도 작업).
      const body = item.content ?? item.contentSnippet ?? ''

      const title = item.title ?? ''
      const author = item.creator ?? item['dc:creator'] ?? item.author ?? undefined

      items.push({
        original_url: originalUrl,
        title,
        body: body || undefined,
        author: typeof author === 'string' ? author : undefined,
        published_at: pubDateStr ?? undefined,
        thumbnail_url: extractThumbnail(item),
        language: detectLanguage(title + ' ' + body),
      })
    }

    return items
  },
}

export default newsSiteAdapter
