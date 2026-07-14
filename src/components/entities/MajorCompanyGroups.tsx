import Link from 'next/link'
import { cn } from '@/lib/utils'
import { computeImportance, getCardDetailHref } from '@/lib/insight/card-meta'
import type { MajorCompanyCard, MajorGroupBucket } from '@/lib/entities/major-companies'
import { cleanNarrative } from '@/lib/text/clean-narrative'
import CompanySymbol from '@/components/entities/CompanySymbol'
import EntitySectionHeader from '@/components/entities/EntitySectionHeader'

/** 6.29–7.5 (en dash) */
function formatShortPeriod(start: string, end: string): string {
  const fmt = (d: Date) => `${d.getMonth() + 1}.${d.getDate()}`
  return `${fmt(new Date(start))}–${fmt(new Date(end))}`
}

/** 중요도는 예외적인 항목만 강조 — high 외에는 표시하지 않는다 */
function ImportanceMark({ importance }: { importance: 'high' | 'mid' | 'low' }) {
  if (importance !== 'high') return null
  return (
    <span className="inline-flex shrink-0 items-center gap-1 text-[11px] font-semibold text-brand-600">
      <span className="size-1.5 rounded-full bg-brand-600" />
      중요
    </span>
  )
}

/** 해시 기호 없이 최대 2개 + 나머지는 +N — 첫 태그만 브랜드 컬러 */
function TagRow({ tags }: { tags: string[] }) {
  if (tags.length === 0) return null
  const shown = tags.slice(0, 2)
  const rest = tags.length - shown.length
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {shown.map((tag, i) => (
        <span
          key={tag}
          className={cn(
            'rounded-md px-2 py-0.5 text-[11px] font-medium',
            i === 0
              ? 'bg-brand-50 text-brand-700 dark:bg-brand-950/30 dark:text-brand-300'
              : 'bg-muted text-muted-foreground'
          )}
        >
          {tag}
        </span>
      ))}
      {rest > 0 && <span className="text-[11px] font-medium text-muted-foreground/70">+{rest}</span>}
    </div>
  )
}

function ImplicationBlock({ text, className }: { text: string; className?: string }) {
  return (
    <div className={cn('rounded-lg bg-brand-50/60 px-3.5 py-3 dark:bg-brand-950/20', className)}>
      <p className="text-[11px] font-semibold tracking-tight text-brand-700 dark:text-brand-300">
        LG U+ 시사점
      </p>
      <p className="mt-1 text-[13px] leading-relaxed text-foreground/75 line-clamp-3">
        {cleanNarrative(text)}
      </p>
    </div>
  )
}

function CardFooter({ count, period }: { count: number; period: string }) {
  return (
    <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground/70">
      <span>{count > 0 ? `관련 기사 ${count}건` : '관련 기사 준비 중'}</span>
      <span className="tabular-nums">{period}</span>
    </div>
  )
}

/** 모든 그룹에서 동일한 폭을 유지하는 3열 그리드용 세로형 카드 */
function CompanyCard({ entry }: { entry: MajorCompanyCard }) {
  const { company, card, hashtags, isGold } = entry
  const importance = computeImportance(card)
  const evidenceCount = card.citations.length || card.source_content_ids.length

  return (
    <Link
      href={`${getCardDetailHref(card)}?origin=entities&view=watchlist`}
      prefetch={false}
      className={cn(
        'group flex flex-col gap-3 rounded-xl border bg-card p-5 transition-all',
        'hover:border-brand-200 hover:shadow-[0_2px_12px_-4px_rgb(0_0_0/0.10)]',
        isGold ? 'io-gold-glow border-transparent' : 'border-border'
      )}
    >
      <div className="flex items-center gap-2">
        <CompanySymbol company={company} />
        <span className="truncate text-[13px] font-semibold text-muted-foreground">{company}</span>
        <div className="flex-1" />
        <ImportanceMark importance={importance} />
      </div>

      <h4 className="text-[17px] font-bold leading-[1.35] text-foreground line-clamp-2 transition-colors group-hover:text-brand-600">
        {cleanNarrative(card.card_headline ?? card.headline)}
      </h4>

      {card.implication && <ImplicationBlock text={card.implication} />}

      <div className="flex-1" />

      <TagRow tags={hashtags} />
      <CardFooter count={evidenceCount} period={formatShortPeriod(card.period_start, card.period_end)} />
    </Link>
  )
}

/** "KT·SK텔레콤 등 주요 기업의 최근 동향" — 별도 설명 필드 없이 대표 회사명으로 구성 */
function groupSubtitle(entries: MajorCompanyCard[]): string {
  const names = entries.slice(0, 2).map(e => e.company)
  if (names.length === 0) return ''
  const lead = names.join('·')
  return entries.length > names.length
    ? `${lead} 등 주요 기업의 최근 동향`
    : `${lead}의 최근 동향`
}

interface Props {
  groups: MajorGroupBucket[]
  /** 그룹당 대표 회사 수(요약 뷰) — 없으면 전체(245 전체 페이지 패턴) */
  repCount?: number
  /** 있으면 그룹이 repCount 초과 시 그룹 헤더에 "전체 보기 →" 노출 */
  seeAllHrefBase?: string
}

/**
 * 주요 기업 계층 섹션(255) — 요약·전체 페이지 공유.
 * 산업군은 박스가 아닌 플랫 섹션 제목, 기업만 카드(시각 표면 1단계).
 * 그리드는 카드 수와 무관하게 3열 고정 — 카드 폭·높이가 그룹마다 같아야 스캔 리듬이 유지된다.
 * (카드가 1~2개인 그룹은 우측 칸을 비워 둔다. 폭이 늘어난 예외 카드가 더 눈에 거슬린다.)
 */
export default function MajorCompanyGroups({ groups, repCount, seeAllHrefBase }: Props) {
  return (
    <div className="space-y-11">
      {groups.map(group => {
        const representatives = repCount
          ? (group.userPicked.length > 0
              ? group.companies.filter(c => group.userPicked.includes(c.company)).slice(0, repCount)
              : group.companies.slice(0, repCount))
          : group.companies
        const hiddenCount = group.companies.length - representatives.length

        return (
          <section key={group.key}>
            <EntitySectionHeader
              title={group.label}
              subtitle={groupSubtitle(representatives)}
              meta={`기업 ${group.companies.length}곳`}
              seeAllHref={hiddenCount > 0 && seeAllHrefBase ? `${seeAllHrefBase}/${group.key}` : undefined}
            />

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {representatives.map(entry => (
                <CompanyCard key={entry.card.id} entry={entry} />
              ))}
            </div>
          </section>
        )
      })}
    </div>
  )
}
