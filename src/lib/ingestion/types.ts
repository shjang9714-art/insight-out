import type { RawItem } from '@/lib/crawler/types'
import type { SourceType } from '@/lib/types'

export const DISCOVERY_PROVIDERS = [
  'direct_rss',
  'direct_sitemap',
  'naver',
  'google',
  'gdelt_doc',
  'gdelt_bigquery',
  'bigkinds',
  'newsapi',
  'manual',
] as const

export type DiscoveryProvider = (typeof DISCOVERY_PROVIDERS)[number]

export interface DiscoveredItem {
  item: RawItem
  provider: DiscoveryProvider
  sourceId?: string | null
  sourceType?: SourceType
  trustTier?: number
  query?: string
  providerItemId?: string
  rawMetadata?: Record<string, unknown>
}

export interface ProviderDiscoveryStat {
  provider: DiscoveryProvider
  status: 'success' | 'partial' | 'skipped' | 'failed'
  fetched: number
  queued: number
  duplicate: number
  error?: string
  mode?: string
}

export interface ArticleCandidateRow {
  id: string
  dedup_key: string
  original_url: string
  canonical_url: string
  normalized_title: string
  title: string
  body_snippet: string | null
  author: string | null
  language: string
  thumbnail_url: string | null
  published_at: string | null
  source_id: string | null
  source_type: SourceType
  trust_tier: number
  first_provider: DiscoveryProvider
  first_query: string | null
  stage: string
  state: string
  attempt_count: number
}
