import CategoryBadge from '@/components/daily-insights/CategoryBadge'
import CompetitorMatrix from '@/components/daily-insights/CompetitorMatrix'
import RelatedInsights from '@/components/daily-insights/RelatedInsights'
import EvidenceDrilldown from '@/components/daily-insights/EvidenceDrilldown'
import type { DailyInsightRow } from '@/lib/daily-insights/types'
import { stripLlmArtifacts } from '@/lib/text/strip-llm-artifacts'

interface DailyInsightDetailProps {
  insight: DailyInsightRow
  relatedInsights?: DailyInsightRow[]
}

// 3C 섹션 — 근거 없어 null인 항목은 렌더 자체를 생략(빈 제목만 남기지 않음, §6).
const TREND_SECTIONS: { key: 'market_trend' | 'competitor_trend' | 'implication'; label: string; emoji: string }[] = [
  { key: 'market_trend', label: '시장·산업 동향', emoji: '📈' },
  { key: 'competitor_trend', label: '경쟁사 동향', emoji: '🏢' },
  { key: 'implication', label: '자사 관점 시사점', emoji: '💡' },
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
      </header>

      <EvidenceDrilldown sections={sections} sourceArticles={insight.source_articles ?? []} />

      {insight.competitor_matrix && insight.competitor_matrix.length > 0 && (
        <CompetitorMatrix matrix={insight.competitor_matrix} />
      )}

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
