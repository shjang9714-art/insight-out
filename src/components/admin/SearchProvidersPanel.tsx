import Link from 'next/link'
import { Search } from 'lucide-react'
import type { ProviderCounts } from '@/lib/admin/crawl-providers'
import { cn } from '@/lib/utils'

interface SearchProvidersPanelProps {
  providers: ProviderCounts | null
  keySet: boolean
  gdeltEnabled: boolean
  seedCount: number | null
  lastCrawledAt: string | null
}

function formatKst(iso: string | null): string {
  if (!iso) return '데이터 없음'
  return new Date(iso).toLocaleString('ko-KR', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export default function SearchProvidersPanel({
  providers,
  keySet,
  gdeltEnabled,
  seedCount,
  lastCrawledAt,
}: SearchProvidersPanelProps) {
  const phaseSkipped = providers?.keyword_phase_skipped ?? false
  const providerRows = [
    {
      name: '네이버',
      status: keySet ? '키 설정됨' : '키 미설정',
      isReady: keySet,
      recentCount: providers?.keyword_naver ?? null,
    },
    {
      name: 'GDELT',
      status: gdeltEnabled ? '활성' : '비활성',
      isReady: gdeltEnabled,
      recentCount: providers?.keyword_gdelt ?? null,
    },
  ]

  return (
    <section
      className="mb-6 overflow-hidden rounded-xl border border-border bg-card"
      aria-labelledby="search-providers-title"
    >
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-4 py-3">
        <div>
          <div className="flex items-center gap-2">
            <Search className="h-4 w-4 text-brand-600" aria-hidden="true" />
            <h2 id="search-providers-title" className="text-sm font-semibold text-foreground">
              검색 수집원
            </h2>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            RSS 소스와 별도로 검색 시드마다 호출되는 수집원입니다.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span
            className={cn(
              'rounded-full border px-2.5 py-1',
              seedCount === 0
                ? 'border-amber-500/30 bg-amber-500/10 text-amber-600'
                : 'border-border bg-muted/50 text-muted-foreground'
            )}
          >
            검색 시드 {seedCount === null ? '데이터 없음' : `${seedCount.toLocaleString()}개`}
          </span>
          <span
            className={cn(
              'rounded-full border px-2.5 py-1',
              phaseSkipped
                ? 'border-amber-500/30 bg-amber-500/10 text-amber-600'
                : 'border-border bg-muted/50 text-muted-foreground'
            )}
          >
            마지막 크롤 {formatKst(lastCrawledAt)}
          </span>
        </div>
      </div>

      <div className="divide-y divide-border">
        {providerRows.map((provider) => {
          const hasNoRecentItems = provider.recentCount === 0
          const isWarning = !provider.isReady || hasNoRecentItems

          return (
            <div
              key={provider.name}
              className={cn(
                'flex flex-wrap items-center justify-between gap-3 px-4 py-3',
                isWarning && 'bg-amber-500/5'
              )}
            >
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-foreground">{provider.name}</span>
                <span
                  className={cn(
                    'rounded-full border px-2 py-0.5 text-xs font-medium',
                    provider.isReady
                      ? 'border-positive/30 bg-positive-soft text-positive'
                      : 'border-amber-500/30 bg-amber-500/10 text-amber-600'
                  )}
                >
                  {provider.status}
                </span>
              </div>
              <p
                className={cn(
                  'text-xs text-muted-foreground',
                  hasNoRecentItems && 'font-medium text-amber-600'
                )}
              >
                최근 유입{' '}
                {provider.recentCount === null
                  ? '데이터 없음'
                  : `${provider.recentCount.toLocaleString()}건`}
              </p>
            </div>
          )
        })}
      </div>

      {(phaseSkipped || seedCount === 0) && (
        <div className="border-t border-amber-500/20 bg-amber-500/10 px-4 py-2.5 text-xs text-amber-600">
          키워드 검색 단계 미실행(시드 미설정)
        </div>
      )}

      <p className="border-t border-border bg-muted/30 px-4 py-2.5 text-xs text-muted-foreground">
        검색 시드는{' '}
        <Link href="/admin/keyword-groups" className="font-medium text-foreground underline underline-offset-2">
          기준정보 &gt; 키워드 그룹
        </Link>
        에서 관리하고, 유입 상세는{' '}
        <Link href="/admin/crawl-logs" className="font-medium text-foreground underline underline-offset-2">
          로그 분석
        </Link>
        에서 확인하세요.
      </p>
    </section>
  )
}
