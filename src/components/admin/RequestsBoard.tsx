'use client'

import { useEffect, useState } from 'react'
import { Loader2, Pin, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import AdminEmptyState from '@/components/admin/ui/AdminEmptyState'
import StatusBadge from '@/components/admin/ui/StatusBadge'
import AdminTabs from '@/components/admin/ui/AdminTabs'
import { cn } from '@/lib/utils'
import {
  type OpsPostType,
  type OpsRequestRow,
  type OpsRequestStatus,
  type OpsAnnouncementStatus,
  type OpsRequestKind,
  REQUEST_STATUSES,
  REQUEST_STATUS_LABEL,
  REQUEST_STATUS_TONE,
  ANNOUNCEMENT_STATUS_LABEL,
  ANNOUNCEMENT_STATUS_TONE,
  REQUEST_KINDS,
  REQUEST_KIND_LABEL,
  STATUS_EMOJI,
  groupWorkByPhase,
} from '@/lib/admin/ops-requests'

const SEGMENT_TABS = [
  { value: 'request',      label: '요청' },
  { value: 'announcement', label: '공지' },
  { value: 'work',         label: '작업' },
]

function formatKst(iso: string): string {
  return new Date(iso).toLocaleString('ko-KR', {
    timeZone: 'Asia/Seoul',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  })
}

const CREATE_FORM_INIT = {
  title: '',
  body: '',
  kind: 'other' as OpsRequestKind,
  owner: '',
  ref: '',
  pinned: false,
  created_by: '',
  phase: '',
  seq: '',
}

export default function RequestsBoard() {
  const [segment, setSegment] = useState<OpsPostType>('request')
  const [posts, setPosts] = useState<OpsRequestRow[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [tableReady, setTableReady] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // 필터 (요청 세그먼트)
  const [statusFilter, setStatusFilter] = useState<'all' | OpsRequestStatus>('all')
  const [kindFilter, setKindFilter] = useState<'all' | OpsRequestKind>('all')
  const [ownerFilter, setOwnerFilter] = useState<'all' | string>('all')

  // 생성 모달
  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState(CREATE_FORM_INIT)
  const [formError, setFormError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  // 인라인 변경 진행 중인 id (중복 클릭 방지)
  const [workingId, setWorkingId] = useState<string | null>(null)

  async function loadPosts(type: OpsPostType) {
    setIsLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/requests?post_type=${type}`)
      const data = await res.json() as { items: OpsRequestRow[]; tableReady: boolean }
      setPosts(data.items ?? [])
      setTableReady(data.tableReady ?? true)
    } catch {
      setError('목록을 불러오지 못했습니다.')
      setTableReady(false)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    const run = async () => {
      await loadPosts(segment)
    }
    void run()
  }, [segment])

  function openCreate() {
    setForm(CREATE_FORM_INIT)
    setFormError(null)
    setShowCreate(true)
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!form.title.trim()) {
      setFormError('제목을 입력해주세요.')
      return
    }
    setIsSaving(true)
    setFormError(null)
    try {
      const res = await fetch('/api/admin/requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          seq: form.seq ? Number(form.seq) : undefined,
          phase: form.phase.trim() || undefined,
          post_type: segment,
        }),
      })
      const data = await res.json() as { item?: OpsRequestRow; error?: string }
      if (!res.ok || !data.item) {
        setFormError(data.error ?? '생성에 실패했습니다.')
        return
      }
      setShowCreate(false)
      await loadPosts(segment)
    } catch {
      setFormError('생성 중 오류가 발생했습니다.')
    } finally {
      setIsSaving(false)
    }
  }

  async function patchPost(id: string, fields: Record<string, unknown>) {
    setWorkingId(id)
    try {
      const res = await fetch('/api/admin/requests', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, ...fields }),
      })
      const data = await res.json() as { item?: OpsRequestRow; error?: string }
      if (res.ok && data.item) {
        setPosts((prev) => prev.map((p) => (p.id === id ? data.item! : p)))
      } else {
        setError(data.error ?? '수정에 실패했습니다.')
      }
    } catch {
      setError('수정 중 오류가 발생했습니다.')
    } finally {
      setWorkingId(null)
    }
  }

  const owners = Array.from(new Set(posts.map((p) => p.owner).filter(Boolean))) as string[]

  const filteredRequests = posts.filter((p) => {
    if (statusFilter !== 'all' && p.status !== statusFilter) return false
    if (kindFilter !== 'all' && p.kind !== kindFilter) return false
    if (ownerFilter !== 'all' && p.owner !== ownerFilter) return false
    return true
  })

  return (
    <div className="space-y-6">
      {!tableReady && (
        <AdminEmptyState
          message="ops_requests 테이블이 아직 적용되지 않았습니다."
          hint="SQL 핸드오프 적용 후 자동으로 활성화됩니다."
        />
      )}

      {/* 세그먼트 필터 — [요청]/[공지]/[작업] (209 — 공유 세그먼트 박스로 통일) */}
      <div className="flex items-center justify-between gap-3">
        <AdminTabs
          items={SEGMENT_TABS}
          value={segment}
          onChange={(v) => setSegment(v as OpsPostType)}
          aria-label="게시판 구분"
        />

        <Button size="sm" onClick={openCreate} disabled={!tableReady}>
          <Plus className="mr-1.5 h-4 w-4" />
          {segment === 'request' ? '새 요청' : segment === 'announcement' ? '새 공지' : '새 작업'}
        </Button>
      </div>

      {error && (
        <p className="admin-caption text-negative">{error}</p>
      )}

      {segment === 'request' ? (
        <>
          {/* 필터 */}
          <div className="flex flex-wrap items-center gap-2">
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as 'all' | OpsRequestStatus)}>
              <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">전체 상태</SelectItem>
                {REQUEST_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>{REQUEST_STATUS_LABEL[s]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={kindFilter} onValueChange={(v) => setKindFilter(v as 'all' | OpsRequestKind)}>
              <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">전체 종류</SelectItem>
                {REQUEST_KINDS.map((k) => (
                  <SelectItem key={k} value={k}>{REQUEST_KIND_LABEL[k]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {owners.length > 0 && (
              <Select value={ownerFilter} onValueChange={setOwnerFilter}>
                <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">전체 담당</SelectItem>
                  {owners.map((o) => (
                    <SelectItem key={o} value={o}>{o}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {/* 목록 */}
          {isLoading ? (
            <div className="flex items-center justify-center py-16 admin-body text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              불러오는 중...
            </div>
          ) : filteredRequests.length === 0 ? (
            <AdminEmptyState message={tableReady ? '등록된 요청이 없습니다.' : '요청 목록을 표시할 수 없습니다.'} />
          ) : (
            <div className="overflow-x-auto rounded-xl border border-border bg-card">
              <table className="w-full min-w-[720px] admin-body">
                <thead>
                  <tr className="border-b border-border bg-muted text-left admin-table-th text-muted-foreground">
                    <th className="px-4 py-3">제목</th>
                    <th className="px-4 py-3">종류</th>
                    <th className="px-4 py-3">상태</th>
                    <th className="px-4 py-3">담당</th>
                    <th className="px-4 py-3">참조</th>
                    <th className="px-4 py-3 whitespace-nowrap">업데이트 (KST)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filteredRequests.map((p) => {
                    const isDone = p.status === 'done'
                    return (
                      <tr key={p.id} className={cn('hover:bg-accent/50 transition-colors', isDone && 'opacity-60')}>
                        <td className="admin-cell-wrap max-w-sm px-4 py-3 admin-table-td font-medium text-foreground">
                          <span className="line-clamp-2">{p.title}</span>
                          {p.body && (
                            <p className="mt-0.5 line-clamp-1 admin-caption text-muted-foreground">{p.body}</p>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 admin-table-td text-muted-foreground">
                          {REQUEST_KIND_LABEL[p.kind] ?? p.kind}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3">
                          <Select
                            value={p.status}
                            onValueChange={(v) => void patchPost(p.id, { status: v })}
                            disabled={workingId === p.id}
                          >
                            <SelectTrigger className="h-8 w-[110px] text-xs">
                              <SelectValue>
                                <StatusBadge
                                  tone={REQUEST_STATUS_TONE[p.status as OpsRequestStatus] ?? 'neutral'}
                                  label={REQUEST_STATUS_LABEL[p.status as OpsRequestStatus] ?? p.status}
                                />
                              </SelectValue>
                            </SelectTrigger>
                            <SelectContent>
                              {REQUEST_STATUSES.map((s) => (
                                <SelectItem key={s} value={s}>{REQUEST_STATUS_LABEL[s]}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 admin-table-td text-muted-foreground">
                          {p.owner ?? '—'}
                        </td>
                        <td className="max-w-[160px] px-4 py-3 admin-table-td text-muted-foreground">
                          {p.ref ? <span className="block truncate" title={p.ref}>{p.ref}</span> : '—'}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 admin-caption text-muted-foreground">
                          {formatKst(p.updated_at)}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      ) : segment === 'announcement' ? (
        <>
          {/* 공지 목록 */}
          {isLoading ? (
            <div className="flex items-center justify-center py-16 admin-body text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              불러오는 중...
            </div>
          ) : posts.length === 0 ? (
            <AdminEmptyState message={tableReady ? '등록된 공지가 없습니다.' : '공지 목록을 표시할 수 없습니다.'} />
          ) : (
            <div className="space-y-3">
              {posts.map((p) => (
                <div key={p.id} className="rounded-2xl border border-border bg-card p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2">
                      {p.pinned && <Pin className="h-3.5 w-3.5 shrink-0 text-brand-600" />}
                      <h3 className="admin-card-title text-foreground">{p.title}</h3>
                    </div>
                    <StatusBadge
                      tone={ANNOUNCEMENT_STATUS_TONE[p.status as OpsAnnouncementStatus] ?? 'neutral'}
                      label={ANNOUNCEMENT_STATUS_LABEL[p.status as OpsAnnouncementStatus] ?? p.status}
                    />
                  </div>
                  {p.body && (
                    <p className="mt-2 whitespace-pre-wrap admin-body text-muted-foreground">{p.body}</p>
                  )}
                  <div className="mt-3 flex items-center justify-between gap-3">
                    <p className="admin-caption text-muted-foreground">
                      {p.created_by ?? '작성자 미상'} · {formatKst(p.created_at)}
                    </p>
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm" variant="outline"
                        disabled={workingId === p.id}
                        onClick={() => void patchPost(p.id, { pinned: !p.pinned })}
                      >
                        {p.pinned ? '고정 해제' : '상단 고정'}
                      </Button>
                      <Button
                        size="sm" variant="outline"
                        disabled={workingId === p.id}
                        onClick={() => void patchPost(p.id, { status: p.status === 'active' ? 'archived' : 'active' })}
                      >
                        {p.status === 'active' ? '보관' : '게시'}
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      ) : (
        <>
          {/* 작업(work) 뷰 — phase 그룹핑, seq 정렬, 신호등 */}
          {isLoading ? (
            <div className="flex items-center justify-center py-16 admin-body text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              불러오는 중...
            </div>
          ) : posts.length === 0 ? (
            <AdminEmptyState message={tableReady ? '등록된 작업이 없습니다.' : '작업 목록을 표시할 수 없습니다.'} />
          ) : (
            <div className="space-y-6">
              {groupWorkByPhase(posts).map(([phase, items]) => (
                <div key={phase}>
                  <h3 className="admin-section-title mb-2 text-foreground">{phase}</h3>
                  <div className="overflow-x-auto rounded-xl border border-border bg-card">
                    <table className="w-full min-w-[720px] admin-body">
                      <thead>
                        <tr className="border-b border-border bg-muted text-left admin-table-th text-muted-foreground">
                          <th className="px-4 py-3 w-[90px]">신호등</th>
                          <th className="px-4 py-3">제목</th>
                          <th className="px-4 py-3">참조</th>
                          <th className="px-4 py-3">담당</th>
                          <th className="px-4 py-3">메모</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {items.map((p) => {
                          const status = p.status as OpsRequestStatus
                          const isDone = status === 'done'
                          return (
                            <tr key={p.id} className={cn('hover:bg-accent/50 transition-colors', isDone && 'opacity-60')}>
                              <td className="whitespace-nowrap px-4 py-3">
                                <Select
                                  value={p.status}
                                  onValueChange={(v) => void patchPost(p.id, { status: v })}
                                  disabled={workingId === p.id}
                                >
                                  <SelectTrigger className="h-8 w-[110px] text-xs">
                                    <SelectValue>
                                      <StatusBadge
                                        tone={REQUEST_STATUS_TONE[status] ?? 'neutral'}
                                        label={`${STATUS_EMOJI[status] ?? ''} ${REQUEST_STATUS_LABEL[status] ?? p.status}`}
                                      />
                                    </SelectValue>
                                  </SelectTrigger>
                                  <SelectContent>
                                    {REQUEST_STATUSES.map((s) => (
                                      <SelectItem key={s} value={s}>{STATUS_EMOJI[s]} {REQUEST_STATUS_LABEL[s]}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </td>
                              <td className="admin-cell-wrap max-w-sm px-4 py-3 admin-table-td font-medium text-foreground">
                                <span className="line-clamp-2">{p.title}</span>
                              </td>
                              <td className="max-w-[160px] px-4 py-3 admin-table-td text-muted-foreground">
                                {p.ref ? <span className="block truncate" title={p.ref}>{p.ref}</span> : '—'}
                              </td>
                              <td className="whitespace-nowrap px-4 py-3 admin-table-td text-muted-foreground">
                                {p.owner ?? '—'}
                              </td>
                              <td className="admin-cell-wrap max-w-xs px-4 py-3 admin-caption text-muted-foreground">
                                {p.body ? <span className="line-clamp-2">{p.body}</span> : '—'}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* 생성 모달 */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{segment === 'request' ? '새 요청' : segment === 'announcement' ? '새 공지' : '새 작업'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="req-title">제목</Label>
              <Input
                id="req-title"
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="예: contents.review_reason 컬럼 적용 요청"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="req-body">본문</Label>
              <textarea
                data-slot="textarea"
                id="req-body"
                value={form.body}
                onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
                rows={4}
                className="w-full resize-y rounded-lg border border-input bg-background px-3 py-2 admin-body text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                placeholder="설명·맥락(선택)"
              />
            </div>

            {segment === 'request' ? (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="req-kind">종류</Label>
                  <Select value={form.kind} onValueChange={(v) => setForm((f) => ({ ...f, kind: v as OpsRequestKind }))}>
                    <SelectTrigger id="req-kind"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {REQUEST_KINDS.map((k) => (
                        <SelectItem key={k} value={k}>{REQUEST_KIND_LABEL[k]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="req-owner">담당</Label>
                  <Input
                    id="req-owner"
                    value={form.owner}
                    onChange={(e) => setForm((f) => ({ ...f, owner: e.target.value }))}
                    placeholder="예: 수희"
                  />
                </div>
                <div className="col-span-2 space-y-1.5">
                  <Label htmlFor="req-ref">참조</Label>
                  <Input
                    id="req-ref"
                    value={form.ref}
                    onChange={(e) => setForm((f) => ({ ...f, ref: e.target.value }))}
                    placeholder="지시서 번호 / 커밋 SHA / 링크"
                  />
                </div>
              </div>
            ) : segment === 'work' ? (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="req-phase">phase</Label>
                  <Input
                    id="req-phase"
                    value={form.phase}
                    onChange={(e) => setForm((f) => ({ ...f, phase: e.target.value }))}
                    placeholder="예: 어드민 v2"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="req-seq">seq</Label>
                  <Input
                    id="req-seq"
                    type="number"
                    value={form.seq}
                    onChange={(e) => setForm((f) => ({ ...f, seq: e.target.value }))}
                    placeholder="예: 1"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="req-owner-work">담당</Label>
                  <Input
                    id="req-owner-work"
                    value={form.owner}
                    onChange={(e) => setForm((f) => ({ ...f, owner: e.target.value }))}
                    placeholder="예: Sonnet"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="req-ref-work">참조</Label>
                  <Input
                    id="req-ref-work"
                    value={form.ref}
                    onChange={(e) => setForm((f) => ({ ...f, ref: e.target.value }))}
                    placeholder="지시서 번호 / 커밋 SHA"
                  />
                </div>
              </div>
            ) : (
              <label className="flex items-center gap-2 admin-body text-foreground">
                <input
                  type="checkbox"
                  checked={form.pinned}
                  onChange={(e) => setForm((f) => ({ ...f, pinned: e.target.checked }))}
                  className="h-4 w-4 rounded border-border accent-[--color-brand-600]"
                />
                상단 고정
              </label>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="req-created-by">작성자</Label>
              <Input
                id="req-created-by"
                value={form.created_by}
                onChange={(e) => setForm((f) => ({ ...f, created_by: e.target.value }))}
                placeholder="예: David / Opus / Sonnet"
              />
            </div>

            {formError && <p className="admin-caption text-negative">{formError}</p>}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowCreate(false)} disabled={isSaving}>
                취소
              </Button>
              <Button type="submit" disabled={isSaving}>
                {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : '생성'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
