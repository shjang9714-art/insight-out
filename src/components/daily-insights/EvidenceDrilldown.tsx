'use client'

import { useState } from 'react'
import { ChevronDown, ChevronUp, ExternalLink, Rocket, ShieldAlert, ListChecks, PenLine } from 'lucide-react'
import type { DailyInsightSourceArticle, ImplicationLenses } from '@/lib/daily-insights/types'
import { stripLlmArtifacts } from '@/lib/text/strip-llm-artifacts'
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

const LENS_META = {
  opportunity: { label: '기회', icon: Rocket, cls: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300' },
  risk: { label: '리스크', icon: ShieldAlert, cls: 'bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300' },
  action: { label: '실행 제안', icon: ListChecks, cls: 'bg-sky-50 text-sky-700 dark:bg-sky-950/30 dark:text-sky-300' },
  editorial: { label: '종합 관점', icon: PenLine, cls: 'bg-muted/50 text-foreground' },
} as const

/**
 * §2.5② 3C 근거 드릴다운 — 문장별 매핑 대신 인사이트 단위 근거 목록으로 폴백(기존
 * InsightCardNewsList.tsx의 "근거 N건 더보기" 토글 패턴 재사용). 시장/경쟁사 동향과
 * 자사 시사점(4갈래 또는 폴백) 어느 트리거에서 눌러도 같은 공유 패널이 펼쳐지고/접힌다.
 * 근거 0건이면 트리거 자체를 렌더하지 않는다.
 */
export default function EvidenceDrilldown({
  sections,
  implicationLenses,
  implicationFallback,
  sourceArticles,
}: EvidenceDrilldownProps) {
  const [expanded, setExpanded] = useState(false)
  const sourceCount = sourceArticles.length

  const evidenceTrigger = sourceCount > 0 && (
    <button
      type="button"
      onClick={() => setExpanded((v) => !v)}
      aria-expanded={expanded}
      className="mt-1 inline-flex items-center gap-0.5 text-[11px] font-medium text-muted-foreground hover:text-brand-600"
    >
      {expanded ? (
        <>접기 <ChevronUp className="h-3 w-3" /></>
      ) : (
        <>근거 보기 ({sourceCount}) <ChevronDown className="h-3 w-3" /></>
      )}
    </button>
  )

  return (
    <>
      <div className="space-y-4">
        {sections.map((s) => (
          <div key={s.key} className="border-l-2 border-brand-600/40 pl-4">
            <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-brand-700">
              {s.emoji} {s.label}
            </p>
            <p className="mt-1.5 text-sm leading-relaxed text-foreground">{stripLlmArtifacts(s.text)}</p>
            {evidenceTrigger}
          </div>
        ))}

        {/* 자사 시사점 — implication_lenses 4갈래(있을 때) 또는 implication 폴백 */}
        {implicationLenses ? (
          <div className="border-l-2 border-brand-600/40 pl-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-brand-700">💡 자사 관점 시사점</p>
            <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
              {(Object.keys(LENS_META) as (keyof ImplicationLenses)[]).map((key) => {
                const text = implicationLenses[key]
                if (!text) return null
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
            {evidenceTrigger}
          </div>
        ) : (
          implicationFallback && (
            <div className="border-l-2 border-brand-600/40 pl-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-brand-700">💡 자사 관점 시사점</p>
              <p className="mt-1.5 text-sm leading-relaxed text-foreground">{stripLlmArtifacts(implicationFallback)}</p>
              {evidenceTrigger}
            </div>
          )
        )}
      </div>

      {sourceCount > 0 && expanded && (
        <section className="space-y-2 rounded-lg bg-muted/40 p-4">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground/80">📰 근거 기사</p>
          <p className="text-[11px] text-muted-foreground/70">{SOURCES_WINDOW_LABEL}</p>
          <ul className="space-y-2">
            {sourceArticles.map((a) => (
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
    </>
  )
}
