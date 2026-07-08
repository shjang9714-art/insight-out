'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import AdminEmptyState from '@/components/admin/ui/AdminEmptyState'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Loader2, ExternalLink } from 'lucide-react'
import type { SourceType, ContentStatus } from '@/lib/types'
import { SOURCE_TYPE_LABELS } from '@/lib/admin/source-types'
import { CONTENT_STATUS_TONE, CRAWL_STATUS_TONE } from '@/lib/admin/status-style'
import StatusBadge from '@/components/admin/ui/StatusBadge'

// ─── 타입 ──────────────────────────────────────────────────────────────────────

type CrawlStatus = 'success' | 'partial' | 'failed'

export interface CrawlLogRow {
  id: string
  status: CrawlStatus
  fetched_count: number
  inserted_count: number
  duplicate_count: number
  held_count: number
  error_message: string | null
  started_at: string | null
  finished_at: string | null
  created_at: string
  source_id: string | null
  sources: { name: string; type: SourceType } | null
}

interface ContentRow {
  id: string
  title: string
  category: string
  status: ContentStatus
  collected_at: string
  original_url: string | null
}

// ─── 상수 ──────────────────────────────────────────────────────────────────────

const STATUS_BADGE: Record<CrawlStatus, { label: string }> = {
  success: { label: '성공' },
  partial: { label: '부분' },
  failed:  { label: '실패' },
}

const CONTENT_STATUS_CONFIG: Record<ContentStatus, { label: string }> = {
  published: { label: '노출' },
  pending:   { label: '검토대기' },
  rejected:  { label: '숨김' },
}

const CONTENT_STATUSES: ContentStatus[] = ['published', 'pending', 'rejected']

// ─── 헬퍼 ──────────────────────────────────────────────────────────────────────

function formatKST(d: string | null): string {
  if (!d) return '—'
  return new Date(d).toLocaleString('ko-KR', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function elapsedSec(started: string | null, finished: string | null): string {
  if (!started || !finished) return '—'
  const sec = Math.round(
    (new Date(finished).getTime() - new Date(started).getTime()) / 1000
  )
  return `${sec}초`
}

// ─── 드릴다운 다이얼로그 ───────────────────────────────────────────────────────

interface DrillDialogProps {
  log: CrawlLogRow
  filterPending: boolean
  onClose: () => void
}

function DrillDialog({ log, filterPending, onClose }: DrillDialogProps) {
  const supabase = createClient()
  const [contents, setContents] = useState<ContentRow[] | null>(null)
  // source_id 없으면 로딩 불필요 — 초기값으로 제어해 effect 내 동기 setState 방지
  const [isLoading, setIsLoading] = useState(() => !!log.source_id)
  const [fetchError, setFetchError] = useState<string | null>(null)

  // Dialog 마운트 시 데이터 fetch (조건부 렌더로 mount 제어)
  useEffect(() => {
    if (!log.source_id) return
    void (async () => {
      try {
        const start = log.started_at ?? log.created_at
        const rawEnd = log.finished_at ?? log.created_at
        // +5초 버퍼 (collected_at 이 실행 중 now()로 찍히므로 근사)
        const end = new Date(new Date(rawEnd).getTime() + 5000).toISOString()

        let query = supabase
          .from('contents')
          .select('id, title, category, status, collected_at, original_url')
          .eq('source_id', log.source_id)
          .gte('collected_at', start)
          .lte('collected_at', end)
          .order('collected_at', { ascending: false })
          .limit(100)

        if (filterPending) {
          query = query.eq('status', 'pending')
        }

        const { data, error } = await query
        if (error) throw error
        setContents((data ?? []) as ContentRow[])
      } catch (err) {
        setFetchError(err instanceof Error ? err.message : '기사 목록을 불러오지 못했습니다.')
      } finally {
        setIsLoading(false)
      }
    })()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const handleStatusChange = async (contentId: string, newStatus: ContentStatus) => {
    // 낙관적 갱신
    setContents(prev =>
      prev ? prev.map(c => c.id === contentId ? { ...c, status: newStatus } : c) : prev
    )
    const { error } = await supabase
      .from('contents')
      .update({ status: newStatus })
      .eq('id', contentId)
    if (error) {
      // 실패 시 원복을 위해 재조회
      setFetchError(`상태 변경 실패: ${error.message}`)
    }
  }

  const sourceName = log.sources?.name ?? '—'
  const runAt = formatKST(log.started_at ?? log.created_at)
  const count = contents?.length ?? 0

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent className="max-h-[85vh] max-w-3xl overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-sm font-semibold leading-snug">
            {sourceName} · {runAt}에 수집한 기사
            {contents !== null && (
              <span className="ml-2 text-xs font-normal text-muted-foreground">
                {filterPending ? `보류 ${count}건` : `${count}건`}
              </span>
            )}
          </DialogTitle>
          <p className="mt-1 text-xs text-muted-foreground">
            이 실행 시간대 수집분 (시간창 역조회 근사 — 짧은 간격 재실행 시 일부 겹칠 수 있음)
          </p>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto mt-2">
          {isLoading && (
            <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              불러오는 중...
            </div>
          )}

          {fetchError && (
            <div className="rounded-lg border border-negative/20 bg-negative-soft px-4 py-3 text-sm text-negative">
              {fetchError}
            </div>
          )}

          {!isLoading && !fetchError && contents !== null && contents.length === 0 && (
            <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
              이 실행 시간대에 수집된 기사가 없습니다.
            </div>
          )}

          {!isLoading && !fetchError && contents && contents.length > 0 && (
            <div className="divide-y divide-border rounded-lg border border-border">
              {contents.map((c) => {
                const statusCfg = CONTENT_STATUS_CONFIG[c.status]
                return (
                  <div key={c.id} className="flex items-start gap-3 px-4 py-3 hover:bg-accent/40">
                    <div className="flex-1 min-w-0">
                      {/* 제목 */}
                      <div className="flex items-start gap-1.5">
                        {c.original_url ? (
                          <a
                            href={c.original_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm font-medium text-foreground hover:text-brand-600 hover:underline line-clamp-2 flex-1"
                          >
                            {c.title}
                          </a>
                        ) : (
                          <span className="text-sm font-medium text-foreground line-clamp-2 flex-1">
                            {c.title}
                          </span>
                        )}
                        {c.original_url && (
                          <ExternalLink className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground/60" />
                        )}
                      </div>
                      {/* 카테고리 · 수집시각 */}
                      <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                        <span>{c.category}</span>
                        <span>·</span>
                        <span>{formatKST(c.collected_at)}</span>
                      </div>
                    </div>

                    {/* 상태 배지 + 변경 */}
                    <div className="flex shrink-0 items-center gap-1.5">
                      <StatusBadge
                        tone={CONTENT_STATUS_TONE[c.status]}
                        label={statusCfg.label}
                        className="text-[11px]"
                      />
                      <div className="flex gap-0.5">
                        {CONTENT_STATUSES.filter(s => s !== c.status).map(s => (
                          <button
                            key={s}
                            onClick={() => handleStatusChange(c.id, s)}
                            className="rounded px-1.5 py-0.5 text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                            title={`${CONTENT_STATUS_CONFIG[s].label}으로 변경`}
                          >
                            → {CONTENT_STATUS_CONFIG[s].label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ─── 메인 테이블 컴포넌트 ─────────────────────────────────────────────────────

interface CrawlLogsTableProps {
  logs: CrawlLogRow[]
}

export default function CrawlLogsTable({ logs }: CrawlLogsTableProps) {
  const [drillLog, setDrillLog] = useState<CrawlLogRow | null>(null)
  const [drillPending, setDrillPending] = useState(false)

  function openDrill(log: CrawlLogRow, pending: boolean) {
    setDrillLog(log)
    setDrillPending(pending)
  }

  return (
    <>
      {logs.length === 0 ? (
        <AdminEmptyState
          message="아직 수집 기록이 없습니다."
          hint="소스를 등록하고 수집을 실행하면 기록이 쌓입니다."
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <table className="w-full min-w-[780px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-border bg-muted text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-3">실행 시각 (KST)</th>
                <th className="px-4 py-3">소스</th>
                <th className="px-4 py-3">상태</th>
                <th className="px-4 py-3 text-right">가져옴</th>
                <th className="px-4 py-3 text-right">신규</th>
                <th className="px-4 py-3 text-right">중복</th>
                <th className="px-4 py-3 text-right">보류</th>
                <th className="px-4 py-3 text-right">소요</th>
                <th className="px-4 py-3">에러</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {logs.map((log) => {
                const badge = STATUS_BADGE[log.status] ?? STATUS_BADGE.failed
                const sourceType = log.sources?.type
                const typeLabel = sourceType ? SOURCE_TYPE_LABELS[sourceType] : null
                const canDrill = !!log.source_id

                return (
                  <tr key={log.id} className="transition-colors hover:bg-accent/50">
                    {/* 실행 시각 */}
                    <td className="whitespace-nowrap px-4 py-3 text-xs text-muted-foreground">
                      {formatKST(log.created_at)}
                    </td>

                    {/* 소스명 + 대구분 배지 */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-medium text-foreground">
                          {log.sources?.name ?? '—'}
                        </span>
                        {typeLabel && (
                          <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
                            {typeLabel}
                          </span>
                        )}
                      </div>
                    </td>

                    {/* 상태 배지 */}
                    <td className="px-4 py-3">
                      <StatusBadge
                        tone={CRAWL_STATUS_TONE[log.status]}
                        label={badge.label}
                        className="text-[11px]"
                      />
                    </td>

                    {/* 가져옴 */}
                    <td className="px-4 py-3 text-right text-xs tabular-nums text-foreground">
                      {log.fetched_count.toLocaleString()}
                    </td>

                    {/* 신규 — 클릭 가능 */}
                    <td className="px-4 py-3 text-right text-xs tabular-nums">
                      {log.inserted_count > 0 && canDrill ? (
                        <button
                          onClick={() => openDrill(log, false)}
                          className="font-medium text-positive underline decoration-dotted hover:opacity-80"
                        >
                          +{log.inserted_count}
                        </button>
                      ) : (
                        <span className="text-muted-foreground">0</span>
                      )}
                    </td>

                    {/* 중복 */}
                    <td className="px-4 py-3 text-right text-xs tabular-nums text-muted-foreground">
                      {log.duplicate_count.toLocaleString()}
                    </td>

                    {/* 보류 — 클릭 가능 */}
                    <td className="px-4 py-3 text-right text-xs tabular-nums">
                      {log.held_count > 0 && canDrill ? (
                        <button
                          onClick={() => openDrill(log, true)}
                          className="font-medium text-yellow-700 underline decoration-dotted hover:text-yellow-800"
                        >
                          {log.held_count}
                        </button>
                      ) : (
                        <span className="text-muted-foreground">{log.held_count.toLocaleString()}</span>
                      )}
                    </td>

                    {/* 소요 */}
                    <td className="whitespace-nowrap px-4 py-3 text-right text-xs text-muted-foreground">
                      {elapsedSec(log.started_at, log.finished_at)}
                    </td>

                    {/* 에러 */}
                    <td className="admin-cell-wrap max-w-[200px] px-4 py-3">
                      {log.error_message ? (
                        <span
                          className="line-clamp-2 text-[11px] text-red-500"
                          title={log.error_message}
                        >
                          {log.error_message}
                        </span>
                      ) : null}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {drillLog && (
        <DrillDialog
          log={drillLog}
          filterPending={drillPending}
          onClose={() => setDrillLog(null)}
        />
      )}
    </>
  )
}
