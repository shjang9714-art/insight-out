import Link from 'next/link'
import { cn } from '@/lib/utils'
import type { CompGroupBucket } from '@/lib/entities/competitor-news'
import LguImpactBadge from '@/components/contents/LguImpactBadge'

function formatCompArticleDate(iso: string): string {
  return new Date(iso).toLocaleDateString('ko-KR', {
    timeZone: 'Asia/Seoul', month: 'short', day: 'numeric',
  })
}

interface Props {
  groups: CompGroupBucket[]
  /** 그룹당 표시할 회사 카드 상한(요약 뷰) — 없으면 전체 표시(245 전체 페이지) */
  capPerGroup?: number
  /** 회사 카드 안에 보여줄 기사 수 — 기본 2 */
  articlesPerCard?: number
  /** 그룹이 capPerGroup 초과 시 그룹 헤더에 "전체보기 →" 노출할 href */
  seeAllHref?: string
}

/** 경쟁사 최근 뉴스 그룹 박스 + 회사 카드 그리드(242·245) — 요약·전체 페이지 공유 */
export default function CompetitorNewsGroups({ groups, capPerGroup, articlesPerCard = 2, seeAllHref }: Props) {
  return (
    <div className="space-y-4">
      {groups.map(group => {
        const visibleResults = capPerGroup ? group.results.slice(0, capPerGroup) : group.results
        const hiddenCount = group.results.length - visibleResults.length

        return (
          <div key={group.name} className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="flex items-center gap-2.5 border-b border-border px-4 py-3">
              <h3 className="text-[15px] font-bold text-foreground">{group.name}</h3>
              <span className="text-xs text-muted-foreground">
                {group.results.length}개사 · {group.articleTotal}건
              </span>
              <div className="flex-1" />
              {(group.impactDist['위기'] + group.impactDist['기회'] > 0) && (
                <div className="flex items-center gap-1">
                  <LguImpactBadge impact="위기" count={group.impactDist['위기']} />
                  <LguImpactBadge impact="기회" count={group.impactDist['기회']} />
                </div>
	              )}
	              {hiddenCount > 0 && seeAllHref && (
	                // prefetch-ok: 정적 전체보기 링크 — 상세 라우트 아님
	                <Link href={seeAllHref} className="text-xs font-medium text-muted-foreground hover:text-foreground hover:underline">
	                  +{hiddenCount}개사 더 →
                </Link>
              )}
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 p-4">
              {visibleResults.map(({ name, articles, articleTotal, impactDist }) => (
                <div
                  key={name}
                  className="rounded-lg border border-border bg-card p-3.5"
                >
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <span className="text-sm font-semibold text-foreground truncate">{name}</span>
                    <div className="flex items-center gap-1 shrink-0">
                      <LguImpactBadge impact="위기" count={impactDist['위기']} />
                      <LguImpactBadge impact="기회" count={impactDist['기회']} />
                      <LguImpactBadge impact="관망" count={impactDist['관망']} />
                    </div>
                  </div>
                  <div className="space-y-1">
                    {articles.slice(0, articlesPerCard).map((a, i) => {
                      const sourceName = Array.isArray(a.sources) ? a.sources[0]?.name : a.sources?.name
                      return (
                        <Link
                          key={a.id}
                          href={`/dashboard/contents/${a.id}`}
                          prefetch={false}
                          className={cn(
                            'flex items-center gap-2 py-1.5 text-xs text-foreground/80 hover:text-foreground hover:underline',
                            i > 0 && 'border-t border-dashed border-border'
                          )}
                        >
                          <span className="line-clamp-1 flex-1 min-w-0">
                            {a.title}
                            {sourceName && <span className="ml-1 text-muted-foreground/60">· {sourceName}</span>}
                          </span>
                          <span className="text-[11px] text-muted-foreground shrink-0">
                            {formatCompArticleDate(a.collected_at)}
                          </span>
                        </Link>
                      )
                    })}
                  </div>
                  {articleTotal > articlesPerCard && (
                    <p className="mt-1 text-[11px] font-medium text-muted-foreground">기사 {articleTotal - articlesPerCard}건 더 →</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}
