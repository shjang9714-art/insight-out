import type { Metadata } from 'next'
import SearchProvidersPanel from '@/components/admin/SearchProvidersPanel'
import SourceManager from '@/components/admin/SourceManager'
import AdminPageHeader from '@/components/admin/ui/AdminPageHeader'
import { parseProviderCounts, type ProviderCounts } from '@/lib/admin/crawl-providers'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: '소스 관리 | 어드민 | Insight Out',
  description: '크롤링 소스(뉴스 피드, 리포트 발행처 등) 추가·수정·삭제·활성 관리',
}

interface SearchSeedRow {
  search_seeds: string[] | null
}

export default async function AdminSourcesPage() {
  const keySet =
    !!(process.env.NAVER_CLIENT_ID ?? process.env.NAVER_SEARCH_CLIENT_ID) &&
    !!(process.env.NAVER_CLIENT_SECRET ?? process.env.NAVER_SEARCH_CLIENT_SECRET)
  const gdeltEnabled = process.env.GDELT_ENABLED !== 'false'

  let providers: ProviderCounts | null = null
  let lastCrawledAt: string | null = null
  let seedCount: number | null = null

  try {
    const admin = createAdminClient()
    const [providerRun, seedRows] = await Promise.all([
      admin
        .from('job_runs')
        .select('started_at, meta')
        .eq('job_key', 'cron:crawl')
        .in('status', ['succeeded', 'failed'])
        .order('started_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      admin
        .from('keyword_groups')
        .select('search_seeds')
        .eq('is_active', true),
    ])

    if (providerRun.error) {
      if (providerRun.error.code !== '42P01') {
        console.error('[/admin/sources] 최신 검색 수집원 집계 조회 실패:', providerRun.error.message)
      }
    } else if (providerRun.data) {
      providers = parseProviderCounts(providerRun.data.meta)
      lastCrawledAt = providerRun.data.started_at
    }

    if (seedRows.error) {
      console.error('[/admin/sources] 검색 시드 조회 실패:', seedRows.error.message)
    } else {
      seedCount = new Set(
        ((seedRows.data ?? []) as SearchSeedRow[])
          .flatMap((row) => row.search_seeds ?? [])
      ).size
    }
  } catch (error) {
    console.error('[/admin/sources] 검색 수집원 상태 조회 오류:', error)
  }

  return (
    <>
      <AdminPageHeader />
      <SearchProvidersPanel
        providers={providers}
        keySet={keySet}
        gdeltEnabled={gdeltEnabled}
        seedCount={seedCount}
        lastCrawledAt={lastCrawledAt}
      />
      <SourceManager />
    </>
  )
}
