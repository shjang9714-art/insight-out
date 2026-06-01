import Parser from 'rss-parser'
import { extract } from '@extractus/article-extractor'
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

      const rawBody = item.contentSnippet ?? item.content ?? ''

      // 본문 폴백: 200자 미만이면 원문 fetch → 본문 추출 시도
      let body = rawBody
      if (body.length < 200) {
        try {
          const extracted = await extract(originalUrl)
          if (extracted?.content && extracted.content.length > body.length) {
            body = extracted.content
          }
        } catch {
          // 폴백 실패 시 RSS 값 유지 (오류 전파 금지, best-effort)
        }
      }

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
