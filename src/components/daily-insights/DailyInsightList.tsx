import Link from 'next/link'
import { ArrowUpRight, ExternalLink, FileText } from 'lucide-react'
import CategoryDotChip from '@/components/daily-insights/CategoryDotChip'
import type { DailyInsightRow } from '@/lib/daily-insights/types'
import { stripLlmArtifacts } from '@/lib/text/strip-llm-artifacts'
import { cn } from '@/lib/utils'
import AiMark from '@/components/ui/AiMark'

interface DailyInsightListProps {
  insights: DailyInsightRow[]
  isLatestWeek: boolean
}

const TREND_SECTIONS: { key: 'market_trend' | 'competitor_trend' | 'implication'; label: string; emoji: string }[] = [
  { key: 'market_trend', label: '시장·산업 동향', emoji: '📈' },
  { key: 'competitor_trend', label: '경쟁사 동향', emoji: '🏢' },
  { key: 'implication', label: '자사 관점 시사점', emoji: '💡' },
]

const SOURCE_PREVIEW_COUNT = 3

/** 1단계 카드 — 홈보다 정보가 많아야 한다(§2): 라벨칩 + summary + 3C 전문 + 근거기사 목록 + 과거기사. */
function InsightCard({ item, isLatestWeek }: { item: DailyInsightRow; isLatestWeek: boolean }) {
  const sections = TREND_SECTIONS.filter((s) => item[s.key])
  const sourceArticles = item.source_articles ?? []
  const previewSources = sourceArticles.slice(0, SOURCE_PREVIEW_COUNT)
  const extraSourceCount = Math.max(0, sourceArticles.length - previewSources.length)
  const pastArticles = item.related_past ?? []
  const repSource = sourceArticles[0]?.source ?? null
  const publishedAt = sourceArticles[0]?.published_at ?? null

  return (
    <article className="flex flex-col gap-3 rounded-xl border border-border bg-card p-5">
      <div className="flex flex-wrap items-center gap-1.5">
        {item.category && <CategoryDotChip category={item.category} />}
        {isLatestWeek && (
          <span className="rounded px-1.5 py-0.5 text-[10px] font-semibold bg-brand-600/10 text-brand-700 dark:text-brand-300">
            NEW
          </span>
        )}
        <span className="text-[11px] text-muted-foreground/70">
          {repSource ? repSource : '출처 미상'}
          {sourceArticles.length > 1 ? ` 외 ${sourceArticles.length - 1}곳` : ''}
          {publishedAt ? ` · ${publishedAt}` : ''}
        </span>
      </div>

      <div>
        <Link href={`/dashboard/daily-insights/${item.id}`} prefetch={false} className="group">
          <h3 className="font-semibold text-foreground leading-snug transition-colors group-hover:text-brand-700">
            <AiMark title="AI 생성 인사이트" className="mr-1" />
            {stripLlmArtifacts(item.headline)}
          </h3>
        </Link>
        <p className="mt-1.5 text-sm text-muted-foreground leading-relaxed">{stripLlmArtifacts(item.summary_ko)}</p>
      </div>

      {sections.length > 0 && (
        <div className="space-y-2.5 border-t border-border/60 pt-3">
          {sections.map((s) => (
            <div
              key={s.key}
              className={cn(
                'rounded-lg px-3 py-2',
                s.key === 'implication' ? 'bg-brand-600/10' : 'bg-muted/40'
              )}
            >
              <p
                className={cn(
                  'text-[11px] font-semibold uppercase tracking-wide',
                  s.key === 'implication' ? 'text-brand-700 dark:text-brand-300' : 'text-muted-foreground'
                )}
              >
                {s.emoji} {s.label}
              </p>
              <p className="mt-1 text-[13px] leading-relaxed text-foreground">{stripLlmArtifacts(item[s.key] ?? '')}</p>
            </div>
          ))}
        </div>
      )}

      {previewSources.length > 0 && (
        <div className="space-y-1.5 border-t border-border/60 pt-3">
          <p className="flex items-center gap-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground/80">
            <FileText className="h-3 w-3" /> 근거 기사
          </p>
          <ul className="space-y-1">
            {previewSources.map((a) => (
              <li key={a.content_id} className="text-xs text-muted-foreground">
                {a.url ? (
                  <a
                    href={a.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 font-medium text-foreground hover:text-brand-600 hover:underline"
                  >
                    {a.title}
                    <ExternalLink className="h-2.5 w-2.5 shrink-0" />
                  </a>
                ) : (
                  <span className="font-medium text-foreground">{a.title}</span>
                )}
                <span className="ml-1 text-muted-foreground/70">({a.source})</span>
              </li>
            ))}
            {extraSourceCount > 0 && (
              <li className="text-[11px] text-muted-foreground/60">외 {extraSourceCount}건</li>
            )}
          </ul>
        </div>
      )}

      {pastArticles.length > 0 && (
        <div className="space-y-1.5 border-t border-border/60 pt-3">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground/80">🕰️ 과거 관련 기사</p>
          <ul className="space-y-1">
            {pastArticles.map((p) => (
              <li key={p.content_id} className="text-xs text-muted-foreground">
                {p.url ? (
                  <a href={p.url} target="_blank" rel="noopener noreferrer" className="font-medium text-foreground hover:text-brand-600 hover:underline">
                    {p.title}
                  </a>
                ) : (
                  <span className="font-medium text-foreground">{p.title}</span>
                )}
                <span className="ml-1 text-muted-foreground/70">{p.published_at ? `(${p.published_at.slice(0, 7)})` : ''}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <Link
        href={`/dashboard/daily-insights/${item.id}`}
        prefetch={false}
        className="inline-flex items-center gap-0.5 self-start text-xs font-medium text-brand-600 hover:underline"
      >
        전체 인사이트 보기
        <ArrowUpRight className="h-3 w-3" />
      </Link>
    </article>
  )
}

export default function DailyInsightList({ insights, isLatestWeek }: DailyInsightListProps) {
  if (insights.length === 0) {
    return (
      <div className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">
        최근 게시된 핵심 인사이트가 없습니다.
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
      {insights.map((item) => (
        <InsightCard key={item.id} item={item} isLatestWeek={isLatestWeek} />
      ))}
    </div>
  )
}
