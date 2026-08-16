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
import AdminFilterChip from '@/components/admin/ui/AdminFilterChip'
import AdminTable, { type AdminTableColumn, type AdminTableState } from '@/components/admin/ui/AdminTable'
import ReportMarkdown from '@/components/reports/ReportMarkdown'
import type { Tone } from '@/lib/admin/status-style'
import {
  type OpsPostType,
  type OpsRequestRow,
  type OpsRequestStatus,
  type OpsAnnouncementStatus,
  type OpsRequestKind,
  REQUEST_STATUSES,
  REQUEST_STATUS_LABEL,
  REQUEST_STATUS_TONE,
  ANNOUNCEMENT_STATUSES,
  ANNOUNCEMENT_STATUS_LABEL,
  ANNOUNCEMENT_STATUS_TONE,
  REQUEST_KINDS,
  REQUEST_KIND_LABEL,
} from '@/lib/admin/ops-requests'

const POST_TYPE_LABEL: Record<OpsPostType, string> = {
  request:      '요청',
  announcement: '공지',
  work:         '작업',
}

const POST_TYPE_TONE: Record<OpsPostType, Tone> = {
  request:      'neutral',
  announcement: 'info',
  work:         'neutral',
}

const CREATE_TITLE: Record<OpsPostType, string> = {
  request:      '새 요청',
  announcement: '새 공지',
  work:         '새 작업',
}

const TYPE_FILTERS: { value: 'all' | OpsPostType; label: string }[] = [
  { value: 'all',          label: '전체' },
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

function statusLabel(post: OpsRequestRow): string {
  return post.post_type === 'announcement'
    ? ANNOUNCEMENT_STATUS_LABEL[post.status as OpsAnnouncementStatus] ?? post.status
    : REQUEST_STATUS_LABEL[post.status as OpsRequestStatus] ?? post.status
}

function statusTone(post: OpsRequestRow): Tone {
  return post.post_type === 'announcement'
    ? ANNOUNCEMENT_STATUS_TONE[post.status as OpsAnnouncementStatus] ?? 'neutral'
    : REQUEST_STATUS_TONE[post.status as OpsRequestStatus] ?? 'neutral'
}

const CREATE_FORM_INIT = {
  post_type: 'request' as OpsPostType,
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
  const [typeFilter, setTypeFilter] = useState<'all' | OpsPostType>('all')
  const [ownerFilter, setOwnerFilter] = useState<'all' | string>('all')
  const [posts, setPosts] = useState<OpsRequestRow[]>([])
  const [tableState, setTableState] = useState<AdminTableState>('loading')
  const [tableReady, setTableReady] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // 생성 모달
  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState(CREATE_FORM_INIT)
  const [formError, setFormError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  // 상세 모달
  const [detail, setDetail] = useState<OpsRequestRow | null>(null)

  // 인라인 변경 진행 중인 id (중복 클릭 방지)
  const [workingId, setWorkingId] = useState<string | null>(null)

  async function loadPosts() {
    setTableState('loading')
    setError(null)
    try {
      const res = await fetch('/api/admin/requests')
      const data = await res.json() as { items: OpsRequestRow[]; tableReady: boolean }
      const nextPosts = data.items ?? []
      setPosts(nextPosts)
      setTableReady(data.tableReady ?? true)
      setTableState(nextPosts[0] ? 'idle' : 'empty')
    } catch {
      setError('목록을 불러오지 못했습니다.')
      setTableReady(false)
      setTableState('error')
    }
  }

  useEffect(() => {
    const run = async () => { await loadPosts() }
    void run()
  }, [])

  function openCreate() {
    setForm({ ...CREATE_FORM_INIT, post_type: typeFilter === 'all' ? 'request' : typeFilter })
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
          post_type: form.post_type,
        }),
      })
      const data = await res.json() as { item?: OpsRequestRow; error?: string }
      if (!res.ok || !data.item) {
        setFormError(data.error ?? '생성에 실패했습니다.')
        return
      }
      setShowCreate(false)
      await loadPosts()
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
        setDetail((prev) => (prev && prev.id === id ? data.item! : prev))
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

  // 정렬: pinned → 작성일 desc (487 AdminTable 규격 — 서버는 pinned·updated_at 순으로 오므로 클라이언트에서 재정렬)
  const sortedPosts = [...posts].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  })

  const filteredPosts = sortedPosts.filter((p) => {
    if (typeFilter !== 'all' && p.post_type !== typeFilter) return false
    if (ownerFilter !== 'all' && p.owner !== ownerFilter) return false
    return true
  })

  const listState = tableState === 'idle' && !filteredPosts[0] ? 'empty' : tableState

  const columns: AdminTableColumn<OpsRequestRow>[] = [
    {
      key: 'post_type',
      header: '유형',
      nowrap: true,
      cell: (post) => <StatusBadge tone={POST_TYPE_TONE[post.post_type]} label={POST_TYPE_LABEL[post.post_type]} />,
    },
    {
      key: 'title',
      header: '제목',
      width: 'max-w-sm',
      cell: (post) => (
        <button
          type="button"
          onClick={() => setDetail(post)}
          className="admin-table-td flex items-center gap-1.5 text-left font-medium text-foreground hover:text-brand-600"
        >
          {post.pinned && <Pin className="h-3.5 w-3.5 shrink-0 text-brand-600" />}
          <span className="admin-cell-wrap line-clamp-2">{post.title}</span>
        </button>
      ),
    },
    { key: 'kind', header: '종류', nowrap: true, cell: (post) => <span className="admin-table-td text-muted-foreground">{REQUEST_KIND_LABEL[post.kind] ?? post.kind}</span> },
    {
      key: 'status',
      header: '상태',
      nowrap: true,
      cell: (post) => {
        const isAnnouncement = post.post_type === 'announcement'
        const statuses: string[] = isAnnouncement ? ANNOUNCEMENT_STATUSES : REQUEST_STATUSES
        const labelOf = (s: string) => isAnnouncement
          ? ANNOUNCEMENT_STATUS_LABEL[s as OpsAnnouncementStatus] ?? s
          : REQUEST_STATUS_LABEL[s as OpsRequestStatus] ?? s
        return (
          <Select value={post.status} onValueChange={(value) => void patchPost(post.id, { status: value })} disabled={workingId === post.id}>
            <SelectTrigger className="h-8 w-[110px] text-xs">
              <SelectValue>
                <StatusBadge tone={statusTone(post)} label={statusLabel(post)} />
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {statuses.map((s) => <SelectItem key={s} value={s}>{labelOf(s)}</SelectItem>)}
            </SelectContent>
          </Select>
        )
      },
    },
    { key: 'owner', header: '담당', nowrap: true, cell: (post) => <span className="admin-table-td text-muted-foreground">{post.owner ?? '—'}</span> },
    { key: 'created_at', header: '작성일 (KST)', nowrap: true, cell: (post) => <span className="admin-caption text-muted-foreground">{formatKst(post.created_at)}</span> },
  ]

  return (
    <div className="space-y-6">
      {!tableReady && (
        <AdminEmptyState
          message="ops_requests 테이블이 아직 적용되지 않았습니다."
          hint="SQL 핸드오프 적용 후 자동으로 활성화됩니다."
        />
      )}

      {/* 유형 필터 칩 — 기본값 전체 (503: 탭 → 칩, 세 유형을 한 목록에) */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {TYPE_FILTERS.map((f) => (
            <AdminFilterChip
              key={f.value}
              active={typeFilter === f.value}
              onClick={() => setTypeFilter(f.value)}
              count={f.value === 'all' ? posts.length : posts.filter((p) => p.post_type === f.value).length}
            >
              {f.label}
            </AdminFilterChip>
          ))}
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

        <Button size="sm" onClick={openCreate} disabled={!tableReady}>
          <Plus className="mr-1.5 h-4 w-4" />
          {typeFilter === 'all' ? '새 글 작성' : CREATE_TITLE[typeFilter]}
        </Button>
      </div>

      {error && (
        <p className="admin-caption text-negative">{error}</p>
      )}

      {/* 목록 — 요청·공지·작업 통합 (본문은 렌더하지 않음, 제목만) */}
      <AdminTable
        columns={columns}
        rows={filteredPosts}
        rowKey={(post) => post.id}
        minWidth="min-w-[760px]"
        rowClassName={(post) => (post.status === 'done' || post.status === 'archived' ? 'opacity-60' : '')}
        state={listState}
        emptyMessage={tableReady ? '등록된 게시글이 없습니다.' : '목록을 표시할 수 없습니다.'}
        errorMessage="목록을 불러오지 못했습니다."
      />

      {/* 상세 모달 — 본문 마크다운 렌더 */}
      <Dialog open={detail !== null} onOpenChange={(open) => { if (!open) setDetail(null) }}>
        <DialogContent className="max-w-2xl">
          {detail && (
            <>
              <DialogHeader>
                <div className="flex items-center gap-2">
                  <StatusBadge tone={POST_TYPE_TONE[detail.post_type]} label={POST_TYPE_LABEL[detail.post_type]} />
                  <StatusBadge tone={statusTone(detail)} label={statusLabel(detail)} />
                </div>
                <DialogTitle className="flex items-center gap-1.5">
                  {detail.pinned && <Pin className="h-4 w-4 shrink-0 text-brand-600" />}
                  {detail.title}
                </DialogTitle>
              </DialogHeader>

              <p className="admin-caption text-muted-foreground">
                {REQUEST_KIND_LABEL[detail.kind] ?? detail.kind} · 담당 {detail.owner ?? '—'} · {detail.created_by ?? '작성자 미상'} · {formatKst(detail.created_at)}
                {detail.ref && <> · 참조 {detail.ref}</>}
              </p>

              <div className="max-h-[50vh] overflow-y-auto rounded-lg border border-border bg-muted/30 p-4">
                {detail.body
                  ? <ReportMarkdown>{detail.body}</ReportMarkdown>
                  : <p className="admin-body text-muted-foreground">본문 없음</p>}
              </div>

              <DialogFooter>
                <Button
                  size="sm" variant="outline"
                  disabled={workingId === detail.id}
                  onClick={() => void patchPost(detail.id, { pinned: !detail.pinned })}
                >
                  {detail.pinned ? '고정 해제' : '상단 고정'}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* 생성 모달 */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{CREATE_TITLE[form.post_type]}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="req-type">유형</Label>
              <Select value={form.post_type} onValueChange={(v) => setForm((f) => ({ ...f, post_type: v as OpsPostType }))}>
                <SelectTrigger id="req-type"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(['request', 'announcement', 'work'] as OpsPostType[]).map((t) => (
                    <SelectItem key={t} value={t}>{POST_TYPE_LABEL[t]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

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
              <Label htmlFor="req-body">본문 <span className="font-normal text-muted-foreground">(마크다운으로 작성됩니다 — #, -, 표 등 GFM 지원)</span></Label>
              <textarea
                data-slot="textarea"
                id="req-body"
                value={form.body}
                onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
                rows={4}
                className="w-full resize-y rounded-lg border border-input bg-background px-3 py-2 admin-body text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                placeholder="마크다운으로 작성 — 설명·맥락(선택)"
              />
            </div>

            {form.post_type === 'request' ? (
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
            ) : form.post_type === 'work' ? (
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
