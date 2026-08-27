import { Rocket, ShieldAlert, ListChecks, PenLine } from 'lucide-react'
import type { DailyInsightSourceArticle, ImplicationLenses } from '@/lib/daily-insights/types'
import { stripLlmArtifacts } from '@/lib/text/strip-llm-artifacts'
import { stripActionTeamSubject } from '@/lib/daily-insights/normalize-action'
import { groupSameEventArticles } from '@/lib/daily-insights/groupSameEventArticles'
import SameEventArticleGroup from '@/components/daily-insights/SameEventArticleGroup'
import { cn } from '@/lib/utils'

interface TrendSection {
  key: string
  label: string
  emoji: string
  text: string
}

interface EvidenceDrilldownProps {
  sections: TrendSection[]
  implicationLenses: ImplicationLenses | null
  implicationFallback: string | null
  sourceArticles: DailyInsightSourceArticle[]
}

const SOURCES_WINDOW_LABEL = '· 지난 7일 이내 발행'

export const LENS_META = {
  opportunity: { label: '기회', icon: Rocket, cls: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300' },
  risk: { label: '리스크', icon: ShieldAlert, cls: 'bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300' },
  action: { label: '실행 제안', icon: ListChecks, cls: 'bg-sky-50 text-sky-700 dark:bg-sky-950/30 dark:text-sky-300' },
  editorial: { label: '종합 관점', icon: PenLine, cls: 'bg-muted/50 text-foreground' },
} as const

/**
 * §2.5② 3C 근거 드릴다운 — 문장별 매핑 대신 인사이트 단위 근거 목록으로 폴백(기존
 * InsightCardNewsList.tsx의 "근거 N건 더보기" 패턴 재사용). 경쟁사 동향(있을 때)과
 * 자사 시사점(4갈래 또는 폴백) 아래에 근거 기사 패널이 항상 펼쳐진 상태로 표시된다.
 * 근거 0건이면 패널 자체를 렌더하지 않는다.
 */
export default function EvidenceDrilldown({
  sections,
  implicationLenses,
  implicationFallback,
  sourceArticles,
}: EvidenceDrilldownProps) {
  const sourceGroups = groupSameEventArticles(sourceArticles)
  const sourceCount = sourceGroups.length

  return (
    <>
      <div className="space-y-4">
        {sections.map((s) => (
          <div key={s.key} className="border-l-2 border-brand-600/40 pl-4">
            <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-brand-700">
              {s.emoji} {s.label}
            </p>
            <p className="mt-1.5 text-sm leading-relaxed text-foreground">{stripLlmArtifacts(s.text)}</p>
          </div>
        ))}

        {/* 자사 시사점 — implication_lenses 4갈래(있을 때) 또는 implication 폴백 */}
        {implicationLenses ? (
          <div className="border-l-2 border-brand-600/40 pl-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-brand-700">💡 자사 관점 시사점</p>
            <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
              {(Object.keys(LENS_META) as (keyof ImplicationLenses)[]).map((key) => {
                const rawText = implicationLenses[key]
                if (!rawText) return null
                const text = key === 'action' ? stripActionTeamSubject(rawText) : rawText
                const meta = LENS_META[key]
                const Icon = meta.icon
                return (
                  <div key={key} className={cn('rounded-lg p-3', meta.cls)}>
                    <p className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide">
                      <Icon className="h-3.5 w-3.5" />
                      {meta.label}
                    </p>
                    <p className="text-[13px] leading-relaxed">{stripLlmArtifacts(text)}</p>
                  </div>
                )
              })}
            </div>
          </div>
        ) : (
          implicationFallback && (
            <div className="border-l-2 border-brand-600/40 pl-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-brand-700">💡 자사 관점 시사점</p>
              <p className="mt-1.5 text-sm leading-relaxed text-foreground">{stripLlmArtifacts(implicationFallback)}</p>
            </div>
          )
        )}
      </div>

      {sourceCount > 0 && (
        <section className="space-y-2 rounded-lg bg-muted/40 p-4">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground/80">📰 근거 기사</p>
          <p className="text-[11px] text-muted-foreground/70">{SOURCES_WINDOW_LABEL}</p>
          <ul className="space-y-2">
            {sourceGroups.map((group) => (
              <SameEventArticleGroup
                key={group.representative.content_id}
                representative={group.representative}
                others={group.others}
              />
            ))}
          </ul>
        </section>
      )}
    </>
  )
}
