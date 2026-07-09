'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Loader2 } from 'lucide-react'
import { ENTITY_TYPE_LABEL, type EntityType } from '@/lib/types'
import { cn } from '@/lib/utils'

export interface YoutubeAnalysisEntity {
  id: string
  canonical_name: string
  entity_type: EntityType
  is_competitor: boolean
}

interface Props {
  contentId: string
  initialSummary: string | null
  entities: YoutubeAnalysisEntity[]
}

type SummaryState = 'loading' | 'loaded' | 'empty'

/** 유튜브 상세 우측 패널 — 주요 내용(요약) + 관련 엔티티. summary_ko 없으면 온디맨드 생성. */
export default function YoutubeAnalysisPanel({ contentId, initialSummary, entities }: Props) {
  const [state, setState] = useState<SummaryState>(initialSummary ? 'loaded' : 'loading')
  const [summary, setSummary] = useState(initialSummary ?? '')

  useEffect(() => {
    if (initialSummary) return
    let cancelled = false

    fetch(`/api/contents/${contentId}/youtube-summary`)
      .then((r) => r.json())
      .then(({ status, summary: text }: { status: string; summary: string | null }) => {
        if (cancelled) return
        if (status === 'done' && text) {
          setSummary(text)
          setState('loaded')
        } else {
          setState('empty')
        }
      })
      .catch(() => {
        if (!cancelled) setState('empty')
      })

    return () => {
      cancelled = true
    }
  }, [contentId, initialSummary])

  return (
    <div className="flex flex-col gap-5 rounded-xl border border-border bg-card p-5">
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground/70">
          주요 내용
        </p>
        {state === 'loading' && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            <span>AI 가 핵심 내용을 분석하는 중입니다…</span>
          </div>
        )}
        {state === 'loaded' && (
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">{summary}</p>
        )}
        {state === 'empty' && (
          <p className="text-sm text-muted-foreground">분석 내용을 불러오지 못했습니다.</p>
        )}
      </div>

      {entities.length > 0 && (
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground/70">
            관련 엔티티
          </p>
          <div className="flex flex-wrap gap-1.5">
            {entities.map((e) => (
              <Link
                key={e.id}
                href={`/dashboard/entities/${e.id}`}
                className={cn(
                  'inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition-opacity hover:opacity-75',
                  e.entity_type === 'tech'     && 'border-blue-200 bg-blue-50 text-blue-700',
                  e.entity_type === 'policy'   && 'border-amber-200 bg-amber-50 text-amber-700',
                  e.entity_type === 'product'  && 'border-violet-200 bg-violet-50 text-violet-700',
                  e.entity_type === 'person'   && 'border-emerald-200 bg-emerald-50 text-emerald-700',
                  e.entity_type === 'industry' && 'border-border bg-muted text-muted-foreground',
                  e.entity_type === 'company'  && (
                    e.is_competitor
                      ? 'border-red-200 bg-red-50 text-red-700'
                      : 'border-brand-200 bg-brand-50 text-brand-700'
                  ),
                )}
              >
                <span className="opacity-60">{ENTITY_TYPE_LABEL[e.entity_type]}</span>
                {e.canonical_name}
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
