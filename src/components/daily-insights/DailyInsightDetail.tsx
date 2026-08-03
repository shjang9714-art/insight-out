import CategoryBadge from '@/components/daily-insights/CategoryBadge'
import CompetitorMatrix from '@/components/daily-insights/CompetitorMatrix'
import RelatedInsights from '@/components/daily-insights/RelatedInsights'
import EvidenceDrilldown from '@/components/daily-insights/EvidenceDrilldown'
import NextSteps from '@/components/daily-insights/NextSteps'
import type { DailyInsightRow } from '@/lib/daily-insights/types'
import { stripLlmArtifacts } from '@/lib/text/strip-llm-artifacts'

interface DailyInsightDetailProps {
  insight: DailyInsightRow
  relatedInsights?: DailyInsightRow[]
}

// 경쟁사 동향 섹션 — 근거 없어 null이면 렌더 자체를 생략(빈 제목만 남기지 않음, §6).
// 시장·산업 동향 박스는 상세 페이지에서 제거(implication_lenses 4카드로 대체, §6).
// 자사 시사점(implication)은 implication_lenses 유무에 따라 EvidenceDrilldown이 별도 처리.
const TREND_SECTIONS: { key: 'competitor_trend'; label: string; emoji: string }[] = [
  { key: 'competitor_trend', label: '경쟁사 동향', emoji: '🏢' },
]

export default function DailyInsightDetail({ insight, relatedInsights = [] }: DailyInsightDetailProps) {
  const sections = TREND_SECTIONS.filter((s) => insight[s.key]).map((s) => ({
    key: s.key,
    label: s.label,
    emoji: s.emoji,
    text: insight[s.key] ?? '',
  }))

  return (
    <article className="space-y-6">
      <header className="space-y-2">
        {insight.category && <CategoryBadge category={insight.category} />}
        <h1 className="text-2xl font-bold leading-snug tracking-tight text-foreground">{stripLlmArtifacts(insight.headline)}</h1>
        <p className="text-sm leading-relaxed text-muted-foreground">💡 {stripLlmArtifacts(insight.summary_ko)}</p>
        {insight.why_it_matters && (
          <p className="rounded-lg bg-brand-600/10 px-3 py-2 text-sm font-medium leading-relaxed text-brand-700 dark:text-brand-300">
            🎯 {stripLlmArtifacts(insight.why_it_matters)}
          </p>
        )}
      </header>

      <EvidenceDrilldown
        sections={sections}
        implicationLenses={insight.implication_lenses}
        implicationFallback={insight.implication}
        sourceArticles={insight.source_articles ?? []}
      />

      {insight.competitor_matrix && insight.competitor_matrix.length > 0 && (
        <CompetitorMatrix matrix={insight.competitor_matrix} />
      )}

      {insight.next_steps && insight.next_steps.length > 0 && <NextSteps steps={insight.next_steps} />}

      {insight.related_past && insight.related_past.length > 0 && (
        <section className="space-y-2 rounded-lg bg-muted/40 p-4">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground/80">🕰️ 과거 관련 기사</p>
          <p className="text-[11px] text-muted-foreground/70">· 지난 6개월 이내 관련 보도</p>
          <ul className="space-y-2">
            {insight.related_past.map((p) => (
              <li key={p.content_id} className="text-xs">
                {p.url ? (
                  <a
                    href={p.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-medium text-foreground hover:text-brand-600 hover:underline"
                  >
                    {p.title}
                  </a>
                ) : (
                  <span className="font-medium text-foreground">{p.title}</span>
                )}
                <span className="ml-1.5 text-muted-foreground">
                  ({p.source}
                  {p.published_at ? ` · ${p.published_at}` : ''})
                </span>
                <p className="mt-0.5 text-muted-foreground">💡 {p.reason}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      <RelatedInsights insights={relatedInsights} />
    </article>
  )
}
