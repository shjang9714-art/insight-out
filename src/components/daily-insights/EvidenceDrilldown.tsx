'use client'

import { useState } from 'react'
import { ChevronDown, ChevronUp, ExternalLink } from 'lucide-react'
import type { DailyInsightSourceArticle } from '@/lib/daily-insights/types'
import { stripLlmArtifacts } from '@/lib/text/strip-llm-artifacts'

interface TrendSection {
  key: string
  label: string
  emoji: string
  text: string
}

interface EvidenceDrilldownProps {
  sections: TrendSection[]
  sourceArticles: DailyInsightSourceArticle[]
}

const SOURCES_WINDOW_LABEL = '· 지난 7일 이내 발행'

/**
 * §2.5② 3C 근거 드릴다운 — 문장별 매핑 대신 인사이트 단위 근거 목록으로 폴백(기존
 * InsightCardNewsList.tsx의 "근거 N건 더보기" 토글 패턴 재사용). 3C 어느 블록에서
 * 눌러도 같은 공유 패널이 펼쳐지고/접힌다. 근거 0건이면 트리거 자체를 렌더하지 않는다.
 */
export default function EvidenceDrilldown({ sections, sourceArticles }: EvidenceDrilldownProps) {
  const [expanded, setExpanded] = useState(false)
  const sourceCount = sourceArticles.length

  return (
    <>
      {sections.length > 0 && (
        <div className="space-y-4">
          {sections.map((s) => (
            <div key={s.key} className="border-l-2 border-brand-600/40 pl-4">
              <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-brand-700">
                {s.emoji} {s.label}
              </p>
              <p className="mt-1.5 text-sm leading-relaxed text-foreground">{stripLlmArtifacts(s.text)}</p>
              {sourceCount > 0 && (
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
              )}
            </div>
          ))}
        </div>
      )}

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
