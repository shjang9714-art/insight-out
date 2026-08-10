'use client'

import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import AdminErrorBox from '@/components/admin/ui/AdminErrorBox'
import AdminTable, { type AdminTableColumn, type AdminTableState } from '@/components/admin/ui/AdminTable'
import { useAdminTable } from '@/lib/admin/use-admin-table'
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
import type { RejectedBy } from '@/lib/crawler/types'

// ─── 타입 ──────────────────────────────────────────────────────────────────────

type CrawlStatus = 'success' | 'partial' | 'failed'

export interface CrawlLogRow {
  id: string
  status: CrawlStatus
  fetched_count: number
  inserted_count: number
  duplicate_count: number
  held_count: number
  /** 312 SQL(rejected_count/rejected_by) 미적용 로그는 null/undefined. */
  rejected_count?: number | null
  rejected_by?: RejectedBy | null
  error_message: string | null
  started_at: string | null
  finished_at: string | null
  created_at: string
  source_id: string | null
  sources: { name: string; type: SourceType } | null
}

// 제외 사유 한글 라벨(312) — orchestrator.ts 의 RejectedBy 키와 1:1
const REJECT_REASON_LABEL: Record<keyof RejectedBy, string> = {
  ad:            '광고성',
  excludedGroup: '그룹제외',
  tooShort:      '길이미달',
  bodyTooShort:  '본문짧음',
  excludeRule:   '제외규칙',
}

function rejectedByTooltip(by: RejectedBy | null | undefined): string {
  if (!by) return ''
  const parts = (Object.keys(REJECT_REASON_LABEL) as (keyof RejectedBy)[])
    .filter((k) => by[k] > 0)
    .map((k) => `${REJECT_REASON_LABEL[k]} ${by[k]}`)
  return parts.join(' · ')
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
  const [savingContentId, setSavingContentId] = useState<string | null>(null)

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
          .is('deleted_at', null)
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
    setSavingContentId(contentId)
    setFetchError(null)
    try {
      const { error } = await supabase
        .from('contents')
        .update({ status: newStatus })
        .eq('id', contentId)
      if (error) {
        setFetchError(`상태 변경 실패: ${error.message}`)
        return
      }
      setContents(prev =>
        prev ? prev.map(c => c.id === contentId ? { ...c, status: newStatus } : c) : prev
      )
      toast.success('상태를 변경했습니다')
    } catch (error) {
      setFetchError(`상태 변경 실패: ${error instanceof Error ? error.message : '알 수 없는 오류'}`)
    } finally {
      setSavingContentId(null)
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
            <AdminErrorBox onDismiss={() => setFetchError(null)}>{fetchError}</AdminErrorBox>
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
                        {savingContentId === c.id && (
                          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-label="상태 저장 중" />
                        )}
                        {CONTENT_STATUSES.filter(s => s !== c.status).map(s => (
                          <button
                            key={s}
                            type="button"
                            disabled={savingContentId === c.id}
                            onClick={() => handleStatusChange(c.id, s)}
                            className="rounded px-1.5 py-0.5 text-[11px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
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
  state: AdminTableState
  errorMessage?: string
  page: number
  pageSize: number
  total: number | null
}

export default function CrawlLogsTable({ logs, state, errorMessage, page, pageSize, total }: CrawlLogsTableProps) {
  const table = useAdminTable({ defaultSort: { key: 'created_at', dir: 'desc' }, pageSize })
  const [drillLog, setDrillLog] = useState<CrawlLogRow | null>(null)
  const [drillPending, setDrillPending] = useState(false)

  function openDrill(log: CrawlLogRow, pending: boolean) {
    setDrillLog(log)
    setDrillPending(pending)
  }

  const columns: AdminTableColumn<CrawlLogRow>[] = [
    { key: 'createdAt', header: '실행 시각 (KST)', nowrap: true, cell: (log) => <span className="text-xs text-muted-foreground">{formatKST(log.created_at)}</span> },
    { key: 'source', header: '소스', cell: (log) => { const sourceType = log.sources?.type; const typeLabel = sourceType ? SOURCE_TYPE_LABELS[sourceType] : null; return <div className="flex items-center gap-1.5"><span className="text-xs font-medium text-foreground">{log.sources?.name ?? '—'}</span>{typeLabel && <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">{typeLabel}</span>}</div> } },
    { key: 'status', header: '상태', cell: (log) => <StatusBadge tone={CRAWL_STATUS_TONE[log.status]} label={(STATUS_BADGE[log.status] ?? STATUS_BADGE.failed).label} className="text-[11px]" /> },
    { key: 'fetched', header: '가져옴', numeric: true, cell: (log) => log.fetched_count },
    { key: 'inserted', header: '신규', align: 'right', cell: (log) => log.inserted_count > 0 && log.source_id ? <button onClick={() => openDrill(log, false)} className="font-medium text-positive underline decoration-dotted hover:opacity-80">+{log.inserted_count}</button> : <span className="text-muted-foreground">0</span> },
    { key: 'duplicate', header: '중복', align: 'right', cell: (log) => <span className="text-xs tabular-nums text-muted-foreground">{log.duplicate_count.toLocaleString()}</span> },
    { key: 'held', header: '보류', align: 'right', cell: (log) => log.held_count > 0 && log.source_id ? <button onClick={() => openDrill(log, true)} className="font-medium text-yellow-700 underline decoration-dotted hover:text-yellow-800">{log.held_count}</button> : <span className="text-muted-foreground">{log.held_count.toLocaleString()}</span> },
    { key: 'rejected', header: '제외', align: 'right', cell: (log) => log.rejected_count == null ? '—' : <span className="text-xs tabular-nums text-muted-foreground" title={rejectedByTooltip(log.rejected_by) || undefined}>{log.rejected_count.toLocaleString()}</span> },
    { key: 'elapsed', header: '소요', align: 'right', nowrap: true, cell: (log) => <span className="text-xs text-muted-foreground">{elapsedSec(log.started_at, log.finished_at)}</span> },
    { key: 'error', header: '에러', width: 'max-w-[200px]', cell: (log) => log.error_message ? <span className="line-clamp-2 text-[11px] text-negative" title={log.error_message}>{log.error_message}</span> : null },
  ]

  return (
    <>
      <AdminTable
        columns={columns}
        rows={logs}
        rowKey={(log) => log.id}
        minWidth="min-w-[780px]"
        state={state}
        emptyMessage="아직 수집 기록이 없습니다."
        emptyHint="소스를 등록하고 수집을 실행하면 기록이 쌓입니다."
        errorMessage={errorMessage}
        pagination={{ page, pageSize, total }}
        onPageChange={table.setPage}
      />

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
