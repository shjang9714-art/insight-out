import Parser from 'rss-parser'
import type { SourceAdapter, RawItem } from '../types'
import type { Source } from '@/lib/types'
import { getPublishedAtSince } from '@/lib/crawler/publication-date'
import { cleanBodyText, htmlToPlainText } from '@/lib/contents/clean-body'
import { stripSourceSuffix } from '@/lib/crawler/similarity'

// rss-parser 커스텀 필드 포함 아이템 타입
type RssItem = Parser.Item & {
  creator?: string
  'dc:creator'?: string
  author?: string
  mediaContent?: { $?: { url?: string } }
  mediaThumbnail?: { $?: { url?: string } }
}

const parser = new Parser<Record<string, unknown>, RssItem>({
  timeout: 12_000,
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
    const items: RawItem[] = []

    for (const item of feed.items) {
      // 당일 발행 정책: 발행일 누락·파싱 실패·기준일 이전 항목은 제외
      const pubDateStr = item.isoDate ?? item.pubDate
      const publishedAt = getPublishedAtSince(pubDateStr, since)
      if (!publishedAt) continue

      const originalUrl = item.link ?? item.guid
      if (!originalUrl) continue

      // 본문은 RSS 제공분(content > snippet)만 사용.
      // 풀페이지 본문 추출은 수집 후 enrichment 단계(orchestrator.enrichRecentContents)에서 진행.
      const rawBody = item.content ?? item.contentSnippet ?? ''
      // 저장 전 HTML 정리: &nbsp; 등 엔티티·태그 제거 → 카드/피드/요약 입력 모두 깨끗하게
      const cleanBody = rawBody ? cleanBodyText(htmlToPlainText(rawBody)) : ''

      // 출처 접미사 제거(" - 매체명" / " | 매체명") — 보수적 정규식, 미매칭 시 원본 유지
      const title = stripSourceSuffix(item.title ?? '')
      if (!title) continue
      const author = item.creator ?? item['dc:creator'] ?? item.author ?? undefined

      items.push({
        original_url: originalUrl,
        title,
        body: cleanBody || undefined,
        author: typeof author === 'string' ? author : undefined,
        published_at: publishedAt,
        thumbnail_url: extractThumbnail(item),
        language: detectLanguage(title + ' ' + cleanBody),
      })
    }

    return items
  },
}

export default newsSiteAdapter
