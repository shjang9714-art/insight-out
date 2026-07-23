import Link from 'next/link'
import { cn } from '@/lib/utils'
import { stripLlmArtifacts } from '@/lib/text/strip-llm-artifacts'

// ─── 타입 ──────────────────────────────────────────────────────────────────────

export interface EntityEventItem {
  id: string
  event_date: string
  signal_type: string | null
  headline: string
  detail: string | null
  /** LG U+(자사) 관점 위기/기회/중립 판정. null 이면 중립으로 표시 */
  biz_impact: 'crisis' | 'opportunity' | 'neutral' | null
  biz_impact_reason: string | null
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

// ─── 자사(LG U+) 관점 위기/기회 라벨 ─────────────────────────────────────────

const BIZ_IMPACT_LABEL: Record<'crisis' | 'opportunity' | 'neutral', string> = {
  crisis: '위기',
  opportunity: '기회',
  neutral: '중립',
}

const BIZ_IMPACT_STYLE: Record<'crisis' | 'opportunity' | 'neutral', string> = {
  crisis: 'bg-negative-soft text-negative',
  opportunity: 'bg-positive-soft text-positive',
  neutral: 'bg-muted text-muted-foreground',
}

// ─── 갱신 시각 표기 ───────────────────────────────────────────────────────────

function formatDaysAgo(iso: string): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)
  if (days <= 0) return '오늘 갱신'
  return `최근 갱신: ${days}일 전`
}

// ─── 타임라인 렌더 ─────────────────────────────────────────────────────────────

interface Props {
  events: EntityEventItem[]
  /** 사건 배치의 최신 생성 시각(entity_events.generated_at 중 최대값). 없으면 미표시 */
  updatedAt?: string | null
}

export default function EntityEventTimeline({ events, updatedAt }: Props) {
  if (events.length === 0) return null

  return (
    <div>
      {updatedAt && (
        <p className="mb-3 text-[11px] text-muted-foreground">{formatDaysAgo(updatedAt)}</p>
      )}
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
                  {(() => {
                    const bizImpact = ev.biz_impact ?? 'neutral'
                    return (
                      <span
                        className={cn(
                          'rounded px-1.5 py-0.5 text-[10px] font-medium',
                          BIZ_IMPACT_STYLE[bizImpact]
                        )}
                        title={ev.biz_impact_reason ?? undefined}
                      >
                        {BIZ_IMPACT_LABEL[bizImpact]}
                      </span>
                    )
                  })()}
                </div>

                {/* 헤드라인 */}
                {ev.citations.length > 0 ? (
                  <Link
                    href={`/dashboard/contents/${ev.citations[0]}`}
                    prefetch={false}
                    aria-label={`${headline} 관련 기사로 이동`}
                    className="block text-sm font-semibold text-foreground leading-snug hover:underline focus-visible:outline-2 focus-visible:outline-brand-600 focus-visible:outline-offset-2"
                  >
                    {headline}
                  </Link>
                ) : (
                  <p className="text-sm font-semibold text-foreground leading-snug">
                    {headline}
                  </p>
                )}

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
                        prefetch={false}
                        aria-label={`"${headline}" 근거 기사 보기`}
                        className="text-[11px] text-brand-600 hover:underline focus-visible:outline-2 focus-visible:outline-brand-600 focus-visible:outline-offset-2"
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
    </div>
  )
}
