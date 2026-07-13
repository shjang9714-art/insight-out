import Link from 'next/link'
import { cn } from '@/lib/utils'
import { computeImportance, getCardDetailHref } from '@/lib/insight/card-meta'
import type { MajorGroupBucket } from '@/lib/entities/major-companies'
import { stripLlmArtifacts } from '@/lib/text/strip-llm-artifacts'

function formatShortPeriod(start: string, end: string): string {
  const fmt = (d: Date) => `${d.getMonth() + 1}.${d.getDate()}`
  return `${fmt(new Date(start))}~${fmt(new Date(end))}`
}

interface Props {
  groups: MajorGroupBucket[]
  /** 그룹당 대표 회사 수(요약 뷰) — 없으면 전체(245 전체 페이지 패턴) */
  repCount?: number
  /** 있으면 그룹이 repCount 초과 시 그룹 헤더에 "전체 보기 →" 노출 */
  seeAllHrefBase?: string
}

/** 주요 기업 계층 그룹 섹션 + 풍부 회사 카드(255) — 요약·전체 페이지 공유 */
export default function MajorCompanyGroups({ groups, repCount, seeAllHrefBase }: Props) {
  return (
    <div className="space-y-4">
      {groups.map(group => {
        const representatives = repCount
          ? (group.userPicked.length > 0
              ? group.companies.filter(c => group.userPicked.includes(c.company)).slice(0, repCount)
              : group.companies.slice(0, repCount))
          : group.companies
        const hiddenCount = group.companies.length - representatives.length

        return (
          <div key={group.key} className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="flex items-center gap-2.5 border-b border-border px-4 py-3">
              <h3 className="text-[15px] font-bold text-foreground">{group.label}</h3>
              <span className="text-xs text-muted-foreground">{group.companies.length}개사</span>
              <div className="flex-1" />
              {hiddenCount > 0 && seeAllHrefBase && (
                <Link href={`${seeAllHrefBase}/${group.key}`} prefetch={false} className="text-xs font-medium text-brand-600 hover:underline">
                  전체 보기 →
                </Link>
              )}
            </div>

            <div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3">
              {representatives.map(({ company, card, hashtags, isGold }) => {
                const importance = computeImportance(card)
                const citations = card.citations.slice(0, 3)
                return (
                  <Link
                    key={card.id}
                    href={getCardDetailHref(card)}
                    prefetch={false}
                    className={cn(
                      'group rounded-xl border bg-card p-4 space-y-2.5 transition-colors hover:border-brand-200',
                      isGold ? 'io-gold-glow border-transparent' : 'border-border'
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-bold text-foreground truncate">{company}</span>
                      <span className={cn(
                        'shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium',
                        importance === 'high' ? 'bg-foreground/10 text-foreground' : 'bg-muted text-muted-foreground'
                      )}>
                        {importance === 'high' ? '중요도 높음' : importance === 'mid' ? '중요도 중간' : '중요도 낮음'}
                      </span>
                    </div>

                    {hashtags.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {hashtags.map(tag => (
                          <span key={tag} className="rounded-full bg-brand-50 px-2 py-0.5 text-[10px] font-medium text-brand-700 dark:bg-brand-950/30 dark:text-brand-300">
                            #{tag}
                          </span>
                        ))}
                      </div>
                    )}

                    <p className="text-sm font-semibold text-foreground leading-snug line-clamp-2 group-hover:text-brand-600">
                      {stripLlmArtifacts(card.card_headline ?? card.headline)}
                    </p>

                    {card.implication && (
                      <p className="text-xs text-muted-foreground leading-relaxed line-clamp-3">
                        {stripLlmArtifacts(card.implication)}
                      </p>
                    )}

                    {citations.length > 0 && (
                      <ul className="space-y-1 border-t border-dashed border-border pt-2">
                        {citations.map((c, i) => (
                          <li key={i} className="text-[11px] text-muted-foreground/80 italic line-clamp-1">
                            &ldquo;{c.quote}&rdquo;
                          </li>
                        ))}
                      </ul>
                    )}

                    <p className="text-[11px] text-muted-foreground/70">
                      {formatShortPeriod(card.period_start, card.period_end)}
                    </p>
                  </Link>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}
