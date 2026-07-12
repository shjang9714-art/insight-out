'use client'

import { useState } from 'react'
import Link from 'next/link'
import { RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'
import { stripLlmArtifacts } from '@/lib/text/strip-llm-artifacts'

// ─── 타입 ──────────────────────────────────────────────────────────────────────

export interface EntityEventItem {
  id: string
  event_date: string
  signal_type: string | null
  headline: string
  detail: string | null
  sentiment: '긍정' | '중립' | '부정' | null
  citations: string[]
}

// ─── 신호 배지 색 (시맨틱 토큰만) ────────────────────────────────────────────

const SIGNAL_STYLE: Record<string, string> = {
  '경쟁사동향': 'border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300',
  '규제':       'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300',
  '정부':       'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300',
  '신제품':     'border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-800 dark:bg-violet-950 dark:text-violet-300',
  '출시':       'border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-800 dark:bg-violet-950 dark:text-violet-300',
  '투자':       'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
  'M&A':        'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
  '기술트렌드': 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-300',
}

const DEFAULT_SIGNAL_STYLE = 'border-border bg-muted text-muted-foreground'

// ─── 논조 점/라벨 ──────────────────────────────────────────────────────────────

const SENTIMENT_STYLE: Record<string, string> = {
  '긍정': 'bg-positive-soft text-positive',
  '중립': 'bg-muted text-muted-foreground',
  '부정': 'bg-negative-soft text-negative',
}

// ─── 관리자 생성 버튼 (클라이언트) ───────────────────────────────────────────

interface GenerateButtonProps {
  entityId: string
}

export function EntityEventGenerateButton({ entityId }: GenerateButtonProps) {
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<string | null>(null)

  async function handleGenerate() {
    setLoading(true)
    setResult(null)
    try {
      const res = await fetch(`/api/admin/entities/${entityId}/events`, { method: 'POST' })
      const data = await res.json() as { count?: number; error?: string }
      if (!res.ok) {
        setResult(`오류: ${data.error ?? res.statusText}`)
      } else {
        setResult(`${data.count}개 사건 생성 완료`)
        setTimeout(() => window.location.reload(), 800)
      }
    } catch (err) {
      setResult(`요청 실패: ${err instanceof Error ? err.message : '알 수 없는 오류'}`)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex items-center gap-3">
      <button
        onClick={handleGenerate}
        disabled={loading}
        className={cn(
          'inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium transition-colors',
          loading
            ? 'opacity-50 cursor-not-allowed text-muted-foreground'
            : 'text-foreground hover:border-brand-600/40 hover:text-brand-600'
        )}
      >
        <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
        {loading ? '생성 중...' : '사건 타임라인 생성/갱신'}
      </button>
      {result && (
        <span className="text-xs text-muted-foreground">{result}</span>
      )}
    </div>
  )
}

// ─── 타임라인 렌더 ─────────────────────────────────────────────────────────────

interface Props {
  events: EntityEventItem[]
}

export default function EntityEventTimeline({ events }: Props) {
  if (events.length === 0) return null

  return (
    <div className="relative">
      {/* 연결선 */}
      <div
        className="absolute left-[7px] top-3 bottom-3 w-px bg-border"
        aria-hidden="true"
      />

      <ol className="space-y-6">
        {events.map((ev) => {
          const headline = stripLlmArtifacts(ev.headline)
          const detail = ev.detail ? stripLlmArtifacts(ev.detail) : null

          return (
            <li key={ev.id} className="relative pl-6">
              {/* 타임라인 점 */}
              <span
                className="absolute left-0 top-3 h-3.5 w-3.5 rounded-full border-2 border-border bg-card"
                aria-hidden="true"
              />

              <div className="space-y-1.5">
                {/* 날짜 + 배지 */}
                <div className="flex flex-wrap items-center gap-2">
                  <time
                    dateTime={ev.event_date}
                    className="text-[11px] text-muted-foreground tabular-nums"
                  >
                    {ev.event_date}
                  </time>
                  {ev.signal_type && (
                    <span className={cn(
                      'rounded-full border px-2 py-0.5 text-[10px] font-medium',
                      SIGNAL_STYLE[ev.signal_type] ?? DEFAULT_SIGNAL_STYLE
                    )}>
                      {ev.signal_type}
                    </span>
                  )}
                  {ev.sentiment && (
                    <span className={cn(
                      'rounded px-1.5 py-0.5 text-[10px] font-medium',
                      SENTIMENT_STYLE[ev.sentiment]
                    )}>
                      {ev.sentiment}
                    </span>
                  )}
                </div>

                {/* 헤드라인 */}
                <p className="text-sm font-semibold text-foreground leading-snug">
                  {headline}
                </p>

                {/* 상세 */}
                {detail && (
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    {detail}
                  </p>
                )}

                {/* 근거 링크 */}
                {ev.citations.length > 0 && (
                  <div className="flex flex-wrap gap-x-3 gap-y-1 pt-0.5">
                    {ev.citations.slice(0, 3).map((cid) => (
                      <Link
                        key={cid}
                        href={`/dashboard/contents/${cid}`}
                        className="text-[11px] text-brand-600 hover:underline"
                      >
                        근거 →
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            </li>
          )
        })}
      </ol>
    </div>
  )
}
