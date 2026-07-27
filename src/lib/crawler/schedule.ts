import type { Source } from '@/lib/types'

export interface CrawlScheduleOptions {
  backfillDays?: number
  force?: boolean
}

const DEFAULT_CRAWL_INTERVAL_MINUTES = 720

export function selectCrawlSources(
  allSources: Source[],
  options: CrawlScheduleOptions,
  nowMs = Date.now()
): Source[] {
  if (options.force || (options.backfillDays ?? 0) > 0) return allSources

  return allSources.filter((source) => {
    if (!source.last_crawled_at) return true

    const lastCrawledMs = new Date(source.last_crawled_at).getTime()
    if (Number.isNaN(lastCrawledMs)) return true

    const intervalMs = (source.crawl_interval_minutes || DEFAULT_CRAWL_INTERVAL_MINUTES) * 60 * 1000
    return nowMs - lastCrawledMs >= intervalMs
  })
}
