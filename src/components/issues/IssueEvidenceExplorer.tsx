'use client'

import { useState } from 'react'
import Link from 'next/link'
import { cn } from '@/lib/utils'

export interface EvidenceItem {
  id: string
  title: string
  category: string | null
  sentiment: '긍정' | '중립' | '부정' | null
  signal_type: string | null
  published_at: string | null
  collected_at: string
  source: string | null
  summary_ko: string | null
}

interface Props {
  items: EvidenceItem[]
  categories: string[]
  signalTypes: string[]
}

const SENTIMENT_STYLE: Record<string, string> = {
  긍정: 'bg-emerald-50 text-emerald-700',
  중립: 'bg-muted text-muted-foreground',
  부정: 'bg-red-50 text-red-600',
}

export default function IssueEvidenceExplorer({ items, categories, signalTypes }: Props) {
  const [selCat,       setSelCat]       = useState<string | null>(null)
  const [selSentiment, setSelSentiment] = useState<string | null>(null)
  const [selSignal,    setSelSignal]    = useState<string | null>(null)

  const filtered = items.filter(item => {
    if (selCat       && (item.category   ?? '기타') !== selCat)       return false
    if (selSentiment && item.sentiment              !== selSentiment)  return false
    if (selSignal    && item.signal_type            !== selSignal)     return false
    return true
  })

  function toggle<T>(cur: T | null, val: T): T | null {
    return cur === val ? null : val
  }

  return (
    <div>
      <h2 className="mb-3 text-sm font-semibold text-foreground">근거 탐색</h2>

      {/* facet 칩 */}
      <div className="mb-4 flex flex-wrap gap-2">
        {/* 카테고리 */}
        {categories.map(cat => (
          <button
            key={`cat-${cat}`}
            onClick={() => setSelCat(toggle(selCat, cat))}
            className={cn(
              'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
              selCat === cat
                ? 'border-foreground bg-foreground text-background'
                : 'border-border text-muted-foreground hover:border-foreground hover:text-foreground'
            )}
          >
            {cat}
          </button>
        ))}

        {/* 구분선 */}
        {categories.length > 0 && (
          <span className="self-center text-border">│</span>
        )}

        {/* 논조 */}
        {(['긍정', '중립', '부정'] as const).map(s => (
          <button
            key={`sent-${s}`}
            onClick={() => setSelSentiment(toggle(selSentiment, s))}
            className={cn(
              'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
              selSentiment === s
                ? cn('border-transparent', SENTIMENT_STYLE[s])
                : 'border-border text-muted-foreground hover:border-foreground hover:text-foreground'
            )}
          >
            {s}
          </button>
        ))}

        {/* 신호유형 */}
        {signalTypes.length > 0 && (
          <span className="self-center text-border">│</span>
        )}
        {signalTypes.map(sig => (
          <button
            key={`sig-${sig}`}
            onClick={() => setSelSignal(toggle(selSignal, sig))}
            className={cn(
              'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
              selSignal === sig
                ? 'border-blue-400 bg-blue-50 text-blue-700'
                : 'border-border text-muted-foreground hover:border-foreground hover:text-foreground'
            )}
          >
            {sig}
          </button>
        ))}

        {/* 초기화 */}
        {(selCat || selSentiment || selSignal) && (
          <button
            onClick={() => { setSelCat(null); setSelSentiment(null); setSelSignal(null) }}
            className="rounded-full border border-dashed border-border px-3 py-1 text-xs text-muted-foreground hover:border-foreground hover:text-foreground transition-colors"
          >
            초기화
          </button>
        )}
      </div>

      {/* 결과 목록 */}
      {filtered.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          해당 조건의 근거 기사가 없습니다.
        </div>
      ) : (
        <ul className="space-y-3">
          {filtered.map(item => {
            const displayAt = item.published_at ?? item.collected_at
            const dateStr = new Date(displayAt).toLocaleDateString('ko-KR', {
              timeZone: 'Asia/Seoul', month: 'short', day: 'numeric',
            })
            return (
              <li
                key={item.id}
                className="rounded-xl border border-border bg-card p-4 space-y-1.5"
              >
                <div className="flex flex-wrap items-start gap-2">
                  {item.sentiment && (
                    <span className={cn(
                      'mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium leading-none',
                      SENTIMENT_STYLE[item.sentiment]
                    )}>
                      {item.sentiment}
                    </span>
                  )}
                  {item.signal_type && (
                    <span className="mt-0.5 shrink-0 rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-medium leading-none text-blue-700">
                      {item.signal_type}
                    </span>
                  )}
                  <Link
                    href={`/dashboard/contents/${item.id}`}
                    className="text-sm font-medium text-foreground leading-snug hover:text-brand-600 transition-colors"
                  >
                    {item.title}
                  </Link>
                </div>
                {item.summary_ko && (
                  <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">
                    {item.summary_ko}
                  </p>
                )}
                <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground/70">
                  {item.source && <span>{item.source}</span>}
                  {item.source && <span>·</span>}
                  <span>{dateStr}</span>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
