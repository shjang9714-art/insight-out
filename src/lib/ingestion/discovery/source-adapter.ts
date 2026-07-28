import 'server-only'

import type { Source } from '@/lib/types'
import type { RawItem } from '@/lib/crawler/types'
import { getAdapter } from '@/lib/crawler/adapters'
import { fetchNewsSitemap } from '@/lib/ingestion/discovery/sitemap'
import type { DiscoveryProvider } from '@/lib/ingestion/types'

export interface SourceDiscoveryResult {
  provider: DiscoveryProvider
  items: RawItem[]
}

export async function discoverFromSource(
  source: Source,
  since: string,
): Promise<SourceDiscoveryResult> {
  if (source.adapter_key === 'generic-sitemap') {
    return {
      provider: 'direct_sitemap',
      items: await fetchNewsSitemap(source, since),
    }
  }

  const adapter = getAdapter(source.type)
  if (!adapter) {
    throw new Error(`지원하지 않는 소스 유형입니다: ${source.type}`)
  }

  return {
    provider: 'direct_rss',
    items: await adapter.fetch(source, since),
  }
}
