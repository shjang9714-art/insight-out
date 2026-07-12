import { ExternalLink } from 'lucide-react'
import CategoryBadge from '@/components/daily-insights/CategoryBadge'
import type { DailyInsightRow } from '@/lib/daily-insights/types'
import { stripLlmArtifacts } from '@/lib/text/strip-llm-artifacts'

interface DailyInsightDetailProps {
  insight: DailyInsightRow
}

// 3C 섹션 — 근거 없어 null인 항목은 렌더 자체를 생략(빈 제목만 남기지 않음, §6).
const TREND_SECTIONS: { key: 'market_trend' | 'competitor_trend' | 'implication'; label: string; emoji: string }[] = [
  { key: 'market_trend', label: '시장·산업 동향', emoji: '📈' },
  { key: 'competitor_trend', label: '경쟁사 동향', emoji: '🏢' },
  { key: 'implication', label: '자사 관점 시사점', emoji: '💡' },
]

export default function DailyInsightDetail({ insight }: DailyInsightDetailProps) {
  const sections = TREND_SECTIONS.filter((s) => insight[s.key])

  return (
    <article className="space-y-6">
      <header className="space-y-2">
        {insight.category && <CategoryBadge category={insight.category} />}
        <h1 className="text-2xl font-bold leading-snug tracking-tight text-foreground">{stripLlmArtifacts(insight.headline)}</h1>
        <p className="text-sm leading-relaxed text-muted-foreground">💡 {stripLlmArtifacts(insight.summary_ko)}</p>
      </header>

      {sections.length > 0 && (
        <div className="space-y-4">
          {sections.map((s) => (
            <div key={s.key} className="border-l-2 border-brand-600/40 pl-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-brand-700">
                {s.emoji} {s.label}
              </p>
              <p className="mt-1.5 text-sm leading-relaxed text-foreground">{stripLlmArtifacts(insight[s.key] ?? '')}</p>
            </div>
          ))}
        </div>
      )}

      {insight.source_articles && insight.source_articles.length > 0 && (
        <section className="space-y-2 rounded-lg bg-muted/40 p-4">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground/80">📰 근거 기사</p>
          <ul className="space-y-2">
            {insight.source_articles.map((a) => (
              <li key={a.content_id} className="text-sm">
                {a.url ? (
                  <a
                    href={a.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 font-medium text-foreground hover:text-brand-600 hover:underline"
                  >
                    {a.title}
                    <ExternalLink className="h-3 w-3 shrink-0" />
                  </a>
                ) : (
                  <span className="font-medium text-foreground">{a.title}</span>
                )}
                <span className="ml-1.5 text-muted-foreground">
                  ({a.source}
                  {a.published_at ? ` · ${a.published_at}` : ''})
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {insight.related_past && insight.related_past.length > 0 && (
        <section className="space-y-2 rounded-lg bg-muted/40 p-4">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground/80">🕰️ 과거 관련 기사</p>
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
    </article>
  )
}
