import Link from 'next/link'
import type { CompGroupBucket, CompResult } from '@/lib/entities/competitor-news'
import LguImpactBadge from '@/components/contents/LguImpactBadge'
import CompanySymbol from '@/components/entities/CompanySymbol'
import EntitySectionHeader from '@/components/entities/EntitySectionHeader'

/** 7.13 — 카드 우측 정렬용 짧은 표기(KST) */
function formatCompArticleDate(iso: string): string {
  const parts = new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric',
  }).formatToParts(new Date(iso))
  const month = parts.find(p => p.type === 'month')?.value ?? ''
  const day = parts.find(p => p.type === 'day')?.value ?? ''
  return `${month}.${day}`
}

/** "KT·SKT 등 경쟁사의 최근 14일 뉴스" — 섹션 설명은 대표 회사명으로 조립 */
function groupSubtitle(results: CompResult[]): string {
  const names = results.slice(0, 2).map(r => r.name)
  if (names.length === 0) return ''
  const lead = names.join('·')
  return results.length > names.length
    ? `${lead} 등 경쟁사의 최근 14일 뉴스`
    : `${lead}의 최근 14일 뉴스`
}

interface CardProps {
  result: CompResult
  articlesPerCard: number
}

/** 경쟁사 회사 카드 — 주요 기업 카드(343)와 동일한 톤: 심볼·회사명 → 기사 목록 → 푸터 메타 */
function CompetitorCard({ result, articlesPerCard }: CardProps) {
  const { name, articles, articleTotal, impactDist } = result
  const shown = articles.slice(0, articlesPerCard)
  const rest = articleTotal - shown.length

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-5">
      <div className="flex items-center gap-2">
        <CompanySymbol company={name} />
        <span className="truncate text-sm font-semibold text-foreground/80">{name}</span>
        <div className="flex-1" />
        {/* 위기·기회만 — '관망'은 대부분이라 배지로 띄우면 신호를 잃는다(313) */}
        <LguImpactBadge impact="위기" count={impactDist['위기']} />
        <LguImpactBadge impact="기회" count={impactDist['기회']} />
      </div>

      {/*
        345: 기사 제목은 항상 2줄(`line-clamp-2` + `min-h-[2.7em]`).
        1줄짜리도 2줄 높이를 차지해야 카드·행 높이가 어긋나지 않는다.
      */}
      <ul className="space-y-1">
        {shown.map(a => {
          const sourceName = Array.isArray(a.sources) ? a.sources[0]?.name : a.sources?.name
          return (
            <li key={a.id}>
              <Link
                href={`/dashboard/contents/${a.id}?origin=entities&view=competitor`}
                prefetch={false}
                target="_blank"
                rel="noopener noreferrer"
                className="group flex items-start gap-2 rounded-md px-1 py-1 -mx-1 transition-colors hover:bg-muted/50"
              >
                <span className="min-h-[2.8em] min-w-0 flex-1 text-sm leading-[1.4] text-foreground/85 line-clamp-2 transition-colors group-hover:text-brand-600">
                  {a.title}
                  {sourceName && <span className="ml-1 text-muted-foreground/60">· {sourceName}</span>}
                </span>
                <span className="shrink-0 pt-0.5 text-[12px] tabular-nums text-muted-foreground/70">
                  {formatCompArticleDate(a.collected_at)}
                </span>
              </Link>
            </li>
          )
        })}
      </ul>

      <div className="flex-1" />

      <div className="flex items-center justify-between gap-2 text-[12px] text-muted-foreground/70">
        <span>기사 {articleTotal}건</span>
        {rest > 0 && <span>+{rest}건 더</span>}
      </div>
    </div>
  )
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

/**
 * 경쟁사 최근 뉴스(242·245) — 요약·전체 페이지 공유.
 * 344: 주요 기업(343)과 동일한 톤 — 그룹 박스 제거(플랫 섹션 헤더), 카드가 유일한 시각 표면,
 * 점선·'관망' 배지 제거, 카드 수와 무관하게 3열 고정.
 */
export default function CompetitorNewsGroups({ groups, capPerGroup, articlesPerCard = 2, seeAllHref }: Props) {
  return (
    <div className="space-y-11">
      {groups.map(group => {
        const visibleResults = capPerGroup ? group.results.slice(0, capPerGroup) : group.results
        const hiddenCount = group.results.length - visibleResults.length

        return (
          <section key={group.name}>
            <EntitySectionHeader
              title={group.name}
              subtitle={groupSubtitle(visibleResults)}
              meta={`기업 ${group.results.length}곳 · 기사 ${group.articleTotal}건`}
              metaSlot={
                (group.impactDist['위기'] + group.impactDist['기회'] > 0) ? (
                  <span className="flex items-center gap-1">
                    <LguImpactBadge impact="위기" count={group.impactDist['위기']} />
                    <LguImpactBadge impact="기회" count={group.impactDist['기회']} />
                  </span>
                ) : undefined
              }
              seeAllHref={hiddenCount > 0 && seeAllHref ? seeAllHref : undefined}
              seeAllLabel={`+${hiddenCount}개사 더 →`}
            />

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {visibleResults.map(result => (
                <CompetitorCard key={result.name} result={result} articlesPerCard={articlesPerCard} />
              ))}
            </div>
          </section>
        )
      })}
    </div>
  )
}
