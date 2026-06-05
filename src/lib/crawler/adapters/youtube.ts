import Parser from 'rss-parser'
import type { Source } from '@/lib/types'

// ─── 타입 ─────────────────────────────────────────────────────────────────────

/** YouTube Atom 피드 아이템에 추가되는 커스텀 필드 */
type YoutubeItem = Parser.Item & {
  videoId?: string
  channelId?: string
}

/** youtube.ts 가 반환하는 파싱 결과 */
export interface YoutubeRawItem {
  videoId: string
  title: string
  channelId: string | null
  published_at: string | null   // ISO 문자열 or null
}

export interface YoutubeChannelFeed {
  feedTitle: string             // feed.title = 채널명
  items: YoutubeRawItem[]
}

// ─── 파서 ─────────────────────────────────────────────────────────────────────

// YouTube Atom 피드: <yt:videoId>, <yt:channelId> 커스텀 필드 매핑
const parser = new Parser<Record<string, unknown>, YoutubeItem>({
  customFields: {
    item: [
      ['yt:videoId',   'videoId'],
      ['yt:channelId', 'channelId'],
    ],
  },
})

// ─── 메인 함수 ─────────────────────────────────────────────────────────────────

/**
 * YouTube 채널 RSS(Atom) 를 파싱해 영상 목록 + 채널명을 반환한다.
 * - videoId 또는 title 이 없는 항목은 스킵.
 * - since 필터 없음 — video_id 유니크 제약으로 멱등 보장(orchestrator 에서 23505 처리).
 */
export async function fetchYoutubeChannel(source: Source): Promise<YoutubeChannelFeed> {
  if (!source.rss_url) {
    console.warn(`[크롤러] 소스 "${source.name}"에 rss_url 이 없습니다. 수집 건너뜀.`)
    return { feedTitle: source.name, items: [] }
  }

  const feed = await parser.parseURL(source.rss_url)

  const feedTitle = feed.title?.trim() || source.name

  const items: YoutubeRawItem[] = []
  for (const item of feed.items) {
    const videoId = item.videoId?.trim()
    const title   = item.title?.trim()

    // videoId 또는 title 없는 항목 스킵
    if (!videoId || !title) continue

    // published_at ISO 정규화 (isoDate 또는 pubDate → Date → ISO)
    let published_at: string | null = null
    const dateStr = item.isoDate ?? item.pubDate
    if (dateStr) {
      const d = new Date(dateStr)
      published_at = isNaN(d.getTime()) ? null : d.toISOString()
    }

    items.push({
      videoId,
      title,
      channelId: item.channelId?.trim() ?? null,
      published_at,
    })
  }

  return { feedTitle, items }
}
