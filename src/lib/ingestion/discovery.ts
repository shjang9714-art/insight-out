import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import { getAdapter } from '@/lib/crawler/adapters'
import { fetchGdeltNewsDetailed } from '@/lib/crawler/adapters/gdelt-news'
import { fetchNaverNewsDetailed } from '@/lib/crawler/adapters/naver-news'
import type { RawItem } from '@/lib/crawler/types'
import { selectCrawlSources } from '@/lib/crawler/schedule'
import type { Source } from '@/lib/types'
import { queueDiscoveredItems } from '@/lib/ingestion/candidate-store'
import { discoverFromSource } from '@/lib/ingestion/discovery/source-adapter'
import {
  DISCOVERY_PROVIDERS,
  type DiscoveredItem,
  type DiscoveryProvider,
  type ProviderDiscoveryStat,
} from '@/lib/ingestion/types'

const DEFAULT_OVERLAP_HOURS = 36
const MAX_SEARCH_SEEDS = 30
const GOOGLE_NEWS_RSS = (query: string) =>
  `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=ko&gl=KR&ceid=KR:ko`

export interface RunDiscoveryOptions {
  providers?: DiscoveryProvider[]
  overlapHours?: number
  force?: boolean
  sourceIds?: string[]
  deadline?: number
}

export interface DiscoverySummary {
  ok: boolean
  since: string
  sourcesProcessed: number
  seedsProcessed: number
  fetched: number
  queued: number
  duplicate: number
  providers: ProviderDiscoveryStat[]
}

function isGoogleNewsPseudoSource(source: Source): boolean {
  if (source.name.toLowerCase().startsWith('google news')) return true
  try {
    return Boolean(source.rss_url && new URL(source.rss_url).hostname === 'news.google.com')
  } catch {
    return false
  }
}

function createProviderStats(providers: Set<DiscoveryProvider>): Map<DiscoveryProvider, ProviderDiscoveryStat> {
  const result = new Map<DiscoveryProvider, ProviderDiscoveryStat>()
  for (const provider of providers) {
    result.set(provider, {
      provider,
      status: 'success',
      fetched: 0,
      queued: 0,
      duplicate: 0,
    })
  }
  return result
}

function addError(
  stat: ProviderDiscoveryStat,
  message: string,
  status: 'partial' | 'skipped' | 'failed' = 'partial',
): void {
  stat.status = stat.fetched > 0 && status === 'failed' ? 'partial' : status
  stat.error = stat.error ? `${stat.error}; ${message}` : message
}

async function queueProviderItems(
  admin: SupabaseClient,
  stat: ProviderDiscoveryStat,
  items: DiscoveredItem[],
): Promise<void> {
  const result = await queueDiscoveredItems(admin, items)
  stat.fetched += result.fetched
  stat.queued += result.queued
  stat.duplicate += result.duplicate
}

async function updateSourceDiscoveryHealth(
  admin: SupabaseClient,
  source: Source,
  items: RawItem[],
): Promise<void> {
  const now = new Date().toISOString()
  const articleTimes = items
    .map((item) => item.published_at ? new Date(item.published_at).getTime() : Number.NaN)
    .filter(Number.isFinite)
  const latestArticleAt = articleTimes.length > 0
    ? new Date(Math.max(...articleTimes)).toISOString()
    : source.last_article_at ?? null
  const update = {
    last_crawled_at: now,
    last_success_at: now,
    last_article_at: latestArticleAt,
    consecutive_zero_runs: items.length > 0 ? 0 : (source.consecutive_zero_runs ?? 0) + 1,
  }
  const { error } = await admin.from('sources').update(update).eq('id', source.id)
  if (error?.code === '42703') {
    await admin.from('sources').update({ last_crawled_at: now }).eq('id', source.id)
  } else if (error) {
    console.error(`[기사 발견] 소스 상태 갱신 실패(${source.name}):`, error.message)
  }
}

async function loadSearchSeeds(admin: SupabaseClient): Promise<string[]> {
  const { data, error } = await admin
    .from('keyword_groups')
    .select('search_seeds')
    .eq('is_active', true)
  if (error) {
    console.warn('[기사 발견] 검색 시드 조회 실패:', error.message)
    return []
  }
  return [...new Set(
    ((data ?? []) as { search_seeds: string[] | null }[])
      .flatMap((row) => row.search_seeds ?? [])
      .map((seed) => seed.trim())
      .filter(Boolean),
  )].slice(0, MAX_SEARCH_SEEDS)
}

export async function runDiscovery(options: RunDiscoveryOptions = {}): Promise<DiscoverySummary> {
  const admin = createAdminClient()
  const selectedProviders = new Set<DiscoveryProvider>(
    options.providers?.length
      ? options.providers.filter((provider) => DISCOVERY_PROVIDERS.includes(provider))
      : ['direct_rss', 'direct_sitemap', 'naver', 'google', 'gdelt_doc'],
  )
  const stats = createProviderStats(selectedProviders)
  const overlapHours = Math.min(Math.max(options.overlapHours ?? DEFAULT_OVERLAP_HOURS, 1), 24 * 30)
  const since = new Date(Date.now() - overlapHours * 60 * 60 * 1000).toISOString()
  let sourcesProcessed = 0
  let seedsProcessed = 0

  if (selectedProviders.has('direct_rss') || selectedProviders.has('direct_sitemap')) {
    const { data, error } = await admin
      .from('sources')
      .select('*')
      .eq('is_active', true)
    if (error) throw new Error(`수집원 조회 실패: ${error.message}`)

    const sourceIds = new Set(options.sourceIds ?? [])
    const scopedSources = ((data ?? []) as Source[])
      .filter((source) => source.type !== 'youtube_channel')
      .filter((source) => !isGoogleNewsPseudoSource(source))
      .filter((source) => sourceIds.size === 0 || sourceIds.has(source.id))
    const dueSources = selectCrawlSources(scopedSources, { force: options.force })

    for (const source of dueSources) {
      if (options.deadline && Date.now() >= options.deadline) break
      const fallbackProvider: DiscoveryProvider =
        source.adapter_key === 'generic-sitemap' ? 'direct_sitemap' : 'direct_rss'
      const stat = stats.get(fallbackProvider)
      if (!stat) continue

      try {
        const result = await discoverFromSource(source, since)
        await queueProviderItems(
          admin,
          stat,
          result.items.map((item) => ({
            item,
            provider: result.provider,
            sourceId: source.id,
            sourceType: source.type,
            trustTier: source.trust_tier,
            providerItemId: item.original_url,
            rawMetadata: { sourceName: source.name },
          })),
        )
        await updateSourceDiscoveryHealth(admin, source, result.items)
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        addError(stat, `${source.name}: ${message}`)
      }
      sourcesProcessed++
    }
  }

  const searchProviders = [...selectedProviders].filter((provider) =>
    provider === 'naver' || provider === 'google' || provider === 'gdelt_doc')
  if (searchProviders.length > 0) {
    const seeds = await loadSearchSeeds(admin)
    const rssAdapter = getAdapter('news_site')
    let naverDisabled = false
    let gdeltDisabled = false
    if (!rssAdapter && selectedProviders.has('google')) {
      addError(stats.get('google')!, 'Google News RSS 어댑터를 찾을 수 없습니다.', 'failed')
    }

    for (const seed of seeds) {
      if (options.deadline && Date.now() >= options.deadline) break

      if (selectedProviders.has('naver') && !naverDisabled) {
        const stat = stats.get('naver')!
        const result = await fetchNaverNewsDetailed(seed, since, { maxItems: 100 })
        stat.mode = result.mode
        if (result.error) addError(stat, `${seed}: ${result.error}`, result.mode === 'disabled' ? 'skipped' : 'partial')
        naverDisabled = result.mode === 'disabled'
        await queueProviderItems(
          admin,
          stat,
          result.items.map((item) => ({
            item,
            provider: 'naver',
            query: seed,
            providerItemId: item.original_url,
            rawMetadata: { apiMode: result.mode },
          })),
        )
      }

      if (selectedProviders.has('google') && rssAdapter) {
        const stat = stats.get('google')!
        try {
          const syntheticSource = {
            rss_url: GOOGLE_NEWS_RSS(seed),
            name: `Google News: ${seed}`,
          } as Source
          const items = await rssAdapter.fetch(syntheticSource, since)
          await queueProviderItems(
            admin,
            stat,
            items.map((item) => ({
              item,
              provider: 'google',
              query: seed,
              providerItemId: item.original_url,
            })),
          )
        } catch (error) {
          addError(stat, `${seed}: ${error instanceof Error ? error.message : String(error)}`)
        }
      }

      if (selectedProviders.has('gdelt_doc') && !gdeltDisabled) {
        const stat = stats.get('gdelt_doc')!
        try {
          const result = await fetchGdeltNewsDetailed(seed, since, { maxRecords: 100 })
          if (result.error) {
            addError(
              stat,
              `${seed}: ${result.error}`,
              result.status === 'disabled' ? 'skipped' : 'partial',
            )
          }
          gdeltDisabled = result.status === 'disabled'
          await queueProviderItems(
            admin,
            stat,
            result.items.map((item) => ({
              item,
              provider: 'gdelt_doc',
              query: seed,
              providerItemId: item.original_url,
            })),
          )
        } catch (error) {
          addError(stat, `${seed}: ${error instanceof Error ? error.message : String(error)}`)
        }
      }

      seedsProcessed++
    }
  }

  const providerStats = [...stats.values()]
  const fetched = providerStats.reduce((sum, stat) => sum + stat.fetched, 0)
  const queued = providerStats.reduce((sum, stat) => sum + stat.queued, 0)
  const duplicate = providerStats.reduce((sum, stat) => sum + stat.duplicate, 0)
  const successfulProviders = providerStats.filter((stat) =>
    stat.status === 'success' || stat.status === 'partial').length

  return {
    ok: providerStats.length === 0 || successfulProviders > 0,
    since,
    sourcesProcessed,
    seedsProcessed,
    fetched,
    queued,
    duplicate,
    providers: providerStats,
  }
}
