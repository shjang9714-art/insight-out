'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Loader2, ShieldCheck, Pencil, LogOut, Mail, Unlock, UserPlus, UserX } from 'lucide-react'
import { toast } from 'sonner'
import AdminErrorBox from '@/components/admin/ui/AdminErrorBox'
import { useAdminConfirm } from '@/components/admin/ui/AdminConfirm'
import {
  updateUserRole,
  promoteByEmail,
  createAdminUser,
  updateUserProfileByAdmin,
  forceSignOutUser,
  liftSignOutBan,
  changeUserEmailByAdmin,
  deactivateUserByAdmin,
} from '@/app/admin/users/actions'
import type { UserRole, ApprovalStatus } from '@/lib/types'
import { DEPARTMENT_DISPLAY_LABEL, FIXED_DEPARTMENT, isOrgGroup, ORG_GROUPS } from '@/lib/org'
import AdminTable, { type AdminTableColumn, type AdminTableState } from '@/components/admin/ui/AdminTable'
import { useAdminTable } from '@/lib/admin/use-admin-table'

interface UserRow {
  id: string
  email: string
  name: string
  department: string | null
  team: string | null
  team_name: string | null
  position: string | null
  role: UserRole
  approval_status: ApprovalStatus
  created_at: string
  last_seen_at: string | null
  bannedUntil: string | null
}

function isBanActive(bannedUntil: string | null): boolean {
  if (!bannedUntil) return false
  return new Date(bannedUntil).getTime() > Date.now()
}

interface Props {
  initialUsers: UserRow[]
  currentUserId: string
  initialAdminCount: number
  tableState: AdminTableState
  page: number
  pageSize: number
  total: number | null
  sort: { key: string; dir: 'asc' | 'desc' }
}

export default function UserManager({ initialUsers, currentUserId, initialAdminCount, tableState, page, pageSize, total, sort }: Props) {
  const confirm = useAdminConfirm()
  const table = useAdminTable({ defaultSort: sort, pageSize })
  const [users, setUsers] = useState<UserRow[]>(initialUsers)
  const [adminCount, setAdminCount] = useState(initialAdminCount)
  const [error, setError] = useState<string | null>(null)
  const [togglingId, setTogglingId] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const [emailInput, setEmailInput] = useState('')
  const [formError, setFormError] = useState<string | null>(null)
  const [formSuccess, setFormSuccess] = useState<string | null>(null)
  const [isPromoting, setIsPromoting] = useState(false)

  const [editingUser, setEditingUser] = useState<UserRow | null>(null)
  const [draftName, setDraftName] = useState('')
  const [draftTeam, setDraftTeam] = useState('')
  const [draftTeamName, setDraftTeamName] = useState('')
  const [editError, setEditError] = useState<string | null>(null)
  const [isSavingProfile, setIsSavingProfile] = useState(false)

  // ── role 토글 ──────────────────────────────────────────────────────────────

  const handleToggleRole = async (user: UserRow, requestedRole?: UserRole) => {
    const newRole: UserRole = requestedRole ?? (user.role === 'admin' ? 'user' : 'admin')
    const label = `${newRole} 권한으로 변경`
    const targetLabel = `${user.name || '이름 미입력'} (${user.email})${user.id === currentUserId ? ' · 본인 계정' : ''}`
    if (!(await confirm({ title: label, description: '사용자 권한을 변경하시겠습니까?', targets: [targetLabel], destructive: newRole === 'user', confirmLabel: '변경' }))) return

    setTogglingId(user.id)
    startTransition(async () => {
      const { error: err } = await updateUserRole(user.id, newRole)
      if (err) {
        setError(err)
      } else {
        setUsers(prev =>
          prev.map(u => u.id === user.id ? { ...u, role: newRole } : u)
        )
        setAdminCount(prev => prev + (newRole === 'admin' ? 1 : -1))
      }
      setTogglingId(null)
    })
  }

  // ── 이메일로 admin 추가 ───────────────────────────────────────────────────

  const handlePromote = async (e: React.FormEvent) => {
    e.preventDefault()
    setFormError(null)
    setFormSuccess(null)

    if (!emailInput.trim()) {
      setFormError('이메일을 입력해주세요.')
      return
    }

    setIsPromoting(true)
    try {
      const { error: err, user: promoted } = await promoteByEmail(emailInput.trim())
      if (err) {
        setFormError(err)
        return
      }
      if (promoted) {
        setUsers(prev => {
          const exists = prev.find(u => u.id === promoted.id)
          if (exists) return prev.map(u => u.id === promoted.id ? { ...u, role: 'admin' } : u)
          return [{ ...promoted, last_seen_at: null, bannedUntil: null }, ...prev]
        })
        setAdminCount(prev => prev + 1)
        setFormSuccess(`${promoted.email} 계정이 admin으로 변경되었습니다.`)
        setEmailInput('')
      }
    } finally {
      setIsPromoting(false)
    }
  }

  // ── 관리자 계정 생성 (F-04) ─────────────────────────────────────────────────

  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [createEmail, setCreateEmail] = useState('')
  const [createPassword, setCreatePassword] = useState('')
  const [createName, setCreateName] = useState('')
  const [createTeam, setCreateTeam] = useState('')
  const [createTeamName, setCreateTeamName] = useState('')
  const [createRole, setCreateRole] = useState<UserRole>('user')
  const [createError, setCreateError] = useState<string | null>(null)
  const [isCreating, setIsCreating] = useState(false)

  const resetCreateForm = () => {
    setCreateEmail('')
    setCreatePassword('')
    setCreateName('')
    setCreateTeam('')
    setCreateTeamName('')
    setCreateRole('user')
    setCreateError(null)
  }

  const handleCreateOpenChange = (open: boolean) => {
    if (!open && !isCreating) {
      setIsCreateOpen(false)
      resetCreateForm()
    } else {
      setIsCreateOpen(open)
    }
  }

  const handleCreateSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (isCreating) return
    setCreateError(null)
    setIsCreating(true)

    try {
      const { error: err, user: created } = await createAdminUser({
        email: createEmail,
        password: createPassword,
        name: createName,
        team: createTeam,
        team_name: createTeamName,
        role: createRole,
      })

      if (err || !created) {
        setCreateError(err ?? '계정 생성에 실패했습니다.')
        return
      }

      setUsers(prev => [{ ...created, last_seen_at: null, bannedUntil: null }, ...prev])
      if (createRole !== 'user') setAdminCount(prev => prev + 1)
      toast.success(`${created.email} 계정을 생성했습니다.`)
      setIsCreateOpen(false)
      resetCreateForm()
    } finally {
      setIsCreating(false)
    }
  }

  // ── 세션 강제 종료 / 로그인 차단 해제 ────────────────────────────────────
  const [signingOutId, setSigningOutId] = useState<string | null>(null)
  const [liftingBanId, setLiftingBanId] = useState<string | null>(null)

  const handleForceSignOut = async (user: UserRow) => {
    if (!(await confirm({
      title: '로그인 차단',
      description: '모든 기기에서 즉시 로그아웃되고, 해제하기 전까지 로그인할 수 없습니다. 24시간 후 자동 해제됩니다.',
      targets: [`${user.name || '이름 미입력'} (${user.email})`],
      confirmLabel: '로그인 차단',
      destructive: true,
    }))) return

    setSigningOutId(user.id)
    startTransition(async () => {
      const { error: err } = await forceSignOutUser(user.id)
      if (err) {
        setError(err)
      } else {
        const bannedUntil = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
        setUsers(prev => prev.map(u => u.id === user.id ? { ...u, bannedUntil } : u))
        toast.success(`${user.email} 계정을 로그인 차단 처리했습니다.`)
      }
      setSigningOutId(null)
    })
  }

  const handleLiftBan = async (user: UserRow) => {
    if (!(await confirm({ title: '차단 해제', targets: [`${user.name || '이름 미입력'} (${user.email})`], confirmLabel: '해제' }))) return

    setLiftingBanId(user.id)
    startTransition(async () => {
      const { error: err } = await liftSignOutBan(user.id)
      if (err) {
        setError(err)
      } else {
        setUsers(prev => prev.map(u => u.id === user.id ? { ...u, bannedUntil: null } : u))
        toast.success(`${user.email} 계정의 로그인 차단을 해제했습니다.`)
      }
      setLiftingBanId(null)
    })
  }

  // ── 사용자 정보 편집 ──────────────────────────────────────────────────────

  const handleEditOpen = (user: UserRow) => {
    const currentTeam = user.team ?? ''
    setEditingUser(user)
    setDraftName(user.name)
    setDraftTeam(isOrgGroup(currentTeam) ? currentTeam : '')
    setDraftTeamName(user.team_name ?? '')
    setEditError(null)
  }

  const handleEditOpenChange = (open: boolean) => {
    if (!open && !isSavingProfile) {
      setEditingUser(null)
      setEditError(null)
    }
  }

  const handleProfileSave = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!editingUser || isSavingProfile) return

    setEditError(null)
    setIsSavingProfile(true)

    try {
      const result = await updateUserProfileByAdmin(editingUser.id, {
        name: draftName,
        team: draftTeam,
        team_name: draftTeamName,
      })

      if (!result.ok) {
        setEditError(result.error)
        return
      }

      const savedName = draftName.trim()
      const savedTeamName = draftTeamName.trim()
      setUsers(prev => prev.map(user => (
        user.id === editingUser.id
          ? {
              ...user,
              name: savedName,
              department: FIXED_DEPARTMENT,
              team: draftTeam,
              team_name: savedTeamName,
            }
          : user
      )))
      setEditingUser(null)
    } finally {
      setIsSavingProfile(false)
    }
  }

  // ── 이메일 변경(572) ──────────────────────────────────────────────────────

  const [emailEditUser, setEmailEditUser] = useState<UserRow | null>(null)
  const [draftEmail, setDraftEmail] = useState('')
  const [emailEditError, setEmailEditError] = useState<string | null>(null)
  const [isSavingEmail, setIsSavingEmail] = useState(false)

  const handleEmailEditOpen = (user: UserRow) => {
    setEmailEditUser(user)
    setDraftEmail(user.email)
    setEmailEditError(null)
  }

  const handleEmailEditOpenChange = (open: boolean) => {
    if (!open && !isSavingEmail) {
      setEmailEditUser(null)
      setEmailEditError(null)
    }
  }

  const handleEmailSave = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!emailEditUser || isSavingEmail) return

    setEmailEditError(null)
    setIsSavingEmail(true)

    try {
      const { error: err } = await changeUserEmailByAdmin(emailEditUser.id, draftEmail)
      if (err) {
        setEmailEditError(err)
        return
      }

      const savedEmail = draftEmail.trim().toLowerCase()
      setUsers(prev => prev.map(user => (
        user.id === emailEditUser.id ? { ...user, email: savedEmail } : user
      )))
      toast.success('이메일을 변경했습니다.')
      setEmailEditUser(null)
    } finally {
      setIsSavingEmail(false)
    }
  }

  // ── 계정 비활성화(572) ────────────────────────────────────────────────────

  const [deactivatingId, setDeactivatingId] = useState<string | null>(null)

  const handleDeactivate = async (user: UserRow) => {
    if (!(await confirm({
      title: '계정 비활성화',
      description: '즉시 로그아웃되고 다시 로그인할 수 없습니다. 계정 복구는 승인 상태를 다시 바꿔야 합니다.',
      targets: [`${user.name || '이름 미입력'} (${user.email})`],
      confirmLabel: '비활성화',
      destructive: true,
    }))) return

    setDeactivatingId(user.id)
    startTransition(async () => {
      const { error: err } = await deactivateUserByAdmin(user.id)
      if (err) {
        setError(err)
      } else {
        setUsers(prev => prev.map(u => u.id === user.id ? { ...u, approval_status: 'deactivated' as ApprovalStatus } : u))
        toast.success(`${user.email} 계정을 비활성화했습니다.`)
      }
      setDeactivatingId(null)
    })
  }

  // ── 렌더 ──────────────────────────────────────────────────────────────────

  const columns: AdminTableColumn<UserRow>[] = [
    { key: 'email', header: '이메일', sortKey: 'email', truncate: true, width: 'max-w-[200px]', cell: (user) => <span className="font-medium text-foreground" title={user.email}>{user.email}</span> },
    { key: 'name', header: '이름', sortKey: 'name', truncate: true, width: 'max-w-[200px]', cell: (user) => <span className="text-muted-foreground" title={user.name ?? undefined}>{user.name || '—'}</span> },
    { key: 'organization', header: '조직', width: 'min-w-[150px]', cell: (user) => <><p className="text-xs font-medium text-foreground"><span className="mr-1 text-muted-foreground">그룹</span>{user.team || '—'}</p><p className="mt-1 text-xs text-muted-foreground"><span className="mr-1">팀</span>{user.team_name || '—'}</p></> },
    { key: 'role', header: '권한', sortKey: 'role', cell: (user) => user.role === 'admin' || user.role === 'super_admin' ? <span className="inline-flex items-center gap-1 rounded-full bg-brand-600/10 px-2.5 py-0.5 text-xs font-semibold text-brand-600"><ShieldCheck className="h-3 w-3" />{user.role}</span> : <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs text-muted-foreground">user</span> },
    { key: 'created_at', header: '가입일', sortKey: 'created_at', nowrap: true, cell: (user) => <span className="text-xs text-muted-foreground">{new Date(user.created_at).toLocaleDateString('ko-KR')}</span> },
    { key: 'last_seen_at', header: '최근 접속', sortKey: 'last_seen_at', nowrap: true, cell: (user) => <span className="text-xs text-muted-foreground">{user.last_seen_at ? new Date(user.last_seen_at).toLocaleString('ko-KR') : '—'}</span> },
    { key: 'actions', header: '작업', align: 'right', nowrap: true, cell: (user) => {
      const roleChangeDisabledReason = user.id === currentUserId && user.role === 'super_admin'
        ? '본인의 super_admin 권한은 직접 변경할 수 없습니다.'
        : null

      return (
        <div className="flex flex-col items-end gap-1">
          <div className="flex items-center justify-end gap-1.5">
            <button type="button" onClick={() => handleEditOpen(user)} className="inline-flex items-center gap-1 rounded bg-muted px-2.5 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-accent"><Pencil className="h-3 w-3" />정보 수정</button>
            <button type="button" onClick={() => handleEmailEditOpen(user)} className="inline-flex items-center gap-1 rounded bg-muted px-2.5 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-accent"><Mail className="h-3 w-3" />이메일 변경</button>
            {user.approval_status === 'approved' && (
              <button type="button" onClick={() => handleDeactivate(user)} disabled={deactivatingId === user.id || isPending} className="inline-flex items-center gap-1 rounded bg-destructive/10 px-2.5 py-1.5 text-xs font-medium text-destructive transition-colors disabled:opacity-40">{deactivatingId === user.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <UserX className="h-3 w-3" />}비활성화</button>
            )}
            {user.id !== currentUserId && (
              isBanActive(user.bannedUntil)
                ? <button type="button" onClick={() => handleLiftBan(user)} disabled={liftingBanId === user.id || isPending} className="inline-flex items-center gap-1 rounded bg-positive-soft px-2.5 py-1.5 text-xs font-medium text-positive transition-colors disabled:opacity-40">{liftingBanId === user.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Unlock className="h-3 w-3" />}차단 해제</button>
                : <button type="button" onClick={() => handleForceSignOut(user)} disabled={signingOutId === user.id || isPending} className="inline-flex items-center gap-1 rounded bg-destructive/10 px-2.5 py-1.5 text-xs font-medium text-destructive transition-colors disabled:opacity-40">{signingOutId === user.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <LogOut className="h-3 w-3" />}로그인 차단</button>
            )}
            <Select value={user.role} onValueChange={(value) => { void handleToggleRole(user, value as UserRole) }} disabled={roleChangeDisabledReason !== null || togglingId === user.id || isPending}>
              <SelectTrigger className="h-8 w-[125px] text-xs"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="user">user</SelectItem><SelectItem value="admin">admin</SelectItem><SelectItem value="super_admin">super_admin</SelectItem></SelectContent>
            </Select>
          </div>
          {roleChangeDisabledReason && (
            <span className="text-[11px] text-muted-foreground">{roleChangeDisabledReason}</span>
          )}
        </div>
      )
    } },
  ]

  return (
    <div className="space-y-6">
      {/* 전역 오류 */}
      {error && (
        <AdminErrorBox onDismiss={() => setError(null)}>
          <span>{error}</span>
        </AdminErrorBox>
      )}

      {/* ── 이메일로 admin 추가 폼 ── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold text-foreground">
            이메일로 admin 권한 부여
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handlePromote} className="space-y-3">
            {formError && (
              <AdminErrorBox>
                {formError}
              </AdminErrorBox>
            )}
            {formSuccess && (
              <div className="rounded-lg border border-positive/20 bg-positive-soft px-4 py-2 text-sm text-positive">
                {formSuccess}
              </div>
            )}
            <div className="flex gap-3">
              <div className="flex flex-1 flex-col gap-1.5">
                <Label htmlFor="admin-email">이메일 주소</Label>
                <Input
                  id="admin-email"
                  type="email"
                  value={emailInput}
                  onChange={e => { setEmailInput(e.target.value); setFormError(null); setFormSuccess(null) }}
                  placeholder="example@company.com"
                />
              </div>
              <div className="flex items-end">
                <Button type="submit" disabled={isPromoting}>
                  {isPromoting ? (
                    <><Loader2 className="mr-2 h-4 w-4 animate-spin" />처리 중...</>
                  ) : (
                    'admin으로 설정'
                  )}
                </Button>
              </div>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* ── 목록 헤더 ── */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          전체 {total?.toLocaleString() ?? '확인 불가'}명 · 전체 admin {adminCount}명
        </p>
        <Button size="sm" onClick={() => setIsCreateOpen(true)}>
          <UserPlus className="mr-1.5 h-3.5 w-3.5" />
          새 계정 생성
        </Button>
      </div>

      {/* ── 사용자 테이블 ── */}
      <AdminTable
        columns={columns}
        rows={users}
        rowKey={(user) => user.id}
        minWidth="min-w-[900px]"
        state={tableState}
        emptyMessage="등록된 사용자가 없습니다."
        errorMessage="사용자 목록을 불러오지 못했습니다."
        onRetry={() => window.location.reload()}
        sort={table.sort}
        onSortChange={table.toggleSort}
        pagination={{ page, pageSize, total }}
        onPageChange={table.setPage}
      />

      <Dialog open={editingUser !== null} onOpenChange={handleEditOpenChange}>
        <DialogContent className="max-w-md">
          <form onSubmit={handleProfileSave}>
            <DialogHeader>
              <DialogTitle>사용자 정보 수정</DialogTitle>
              <DialogDescription>
                이름과 조직 정보를 수정합니다. 권한과 승인 상태는 변경되지 않습니다.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="edit-user-name">
                  이름 <span className="text-negative">*</span>
                </Label>
                <Input
                  id="edit-user-name"
                  value={draftName}
                  onChange={event => setDraftName(event.target.value)}
                  placeholder="홍길동"
                  required
                  autoFocus
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="edit-user-department">부문</Label>
                <Input
                  id="edit-user-department"
                  value={DEPARTMENT_DISPLAY_LABEL}
                  readOnly
                  className="bg-muted text-muted-foreground"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="edit-user-team">
                  그룹 <span className="text-negative">*</span>
                </Label>
                <Select value={draftTeam} onValueChange={setDraftTeam}>
                  <SelectTrigger id="edit-user-team" className="w-full">
                    <SelectValue placeholder="그룹을 선택하세요" />
                  </SelectTrigger>
                  <SelectContent>
                    {ORG_GROUPS.map(group => (
                      <SelectItem key={group} value={group}>{group}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="edit-user-team-name">팀</Label>
                <Input
                  id="edit-user-team-name"
                  value={draftTeamName}
                  onChange={event => setDraftTeamName(event.target.value)}
                  placeholder="예: 클라우드사업팀"
                />
              </div>

              {editError && (
                <p className="text-xs text-negative" role="alert">{editError}</p>
              )}
            </div>

            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="outline" size="sm" disabled={isSavingProfile}>
                  취소
                </Button>
              </DialogClose>
              <Button type="submit" size="sm" disabled={isSavingProfile}>
                {isSavingProfile ? (
                  <><Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />저장 중...</>
                ) : (
                  '저장'
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={emailEditUser !== null} onOpenChange={handleEmailEditOpenChange}>
        <DialogContent className="max-w-md">
          <form onSubmit={handleEmailSave}>
            <DialogHeader>
              <DialogTitle>이메일 변경</DialogTitle>
              <DialogDescription>
                이 계정의 로그인 이메일을 변경합니다. Auth 계정과 사용자 정보가 함께 갱신됩니다.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="edit-user-email">
                  새 이메일 <span className="text-negative">*</span>
                </Label>
                <Input
                  id="edit-user-email"
                  type="email"
                  value={draftEmail}
                  onChange={event => setDraftEmail(event.target.value)}
                  placeholder="example@company.com"
                  required
                  autoFocus
                />
              </div>

              {emailEditError && (
                <p className="text-xs text-negative" role="alert">{emailEditError}</p>
              )}
            </div>

            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="outline" size="sm" disabled={isSavingEmail}>
                  취소
                </Button>
              </DialogClose>
              <Button type="submit" size="sm" disabled={isSavingEmail}>
                {isSavingEmail ? (
                  <><Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />변경 중...</>
                ) : (
                  '변경'
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={isCreateOpen} onOpenChange={handleCreateOpenChange}>
        <DialogContent className="max-w-md">
          <form onSubmit={handleCreateSubmit}>
            <DialogHeader>
              <DialogTitle>새 계정 생성</DialogTitle>
              <DialogDescription>
                신규 진입·권한 없음 상태 등을 검증할 테스트 계정을 만듭니다.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="create-user-email">
                  이메일 <span className="text-negative">*</span>
                </Label>
                <Input
                  id="create-user-email"
                  type="email"
                  value={createEmail}
                  onChange={event => setCreateEmail(event.target.value)}
                  placeholder="example@company.com"
                  required
                  autoFocus
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="create-user-password">
                  초기 비밀번호 <span className="text-negative">*</span>
                </Label>
                <Input
                  id="create-user-password"
                  type="text"
                  value={createPassword}
                  onChange={event => setCreatePassword(event.target.value)}
                  placeholder="8자 이상"
                  required
                  minLength={8}
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="create-user-name">
                  이름 <span className="text-negative">*</span>
                </Label>
                <Input
                  id="create-user-name"
                  value={createName}
                  onChange={event => setCreateName(event.target.value)}
                  placeholder="홍길동"
                  required
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="create-user-team">
                  그룹 <span className="text-negative">*</span>
                </Label>
                <Select value={createTeam} onValueChange={setCreateTeam}>
                  <SelectTrigger id="create-user-team" className="w-full">
                    <SelectValue placeholder="그룹을 선택하세요" />
                  </SelectTrigger>
                  <SelectContent>
                    {ORG_GROUPS.map(group => (
                      <SelectItem key={group} value={group}>{group}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="create-user-team-name">팀</Label>
                <Input
                  id="create-user-team-name"
                  value={createTeamName}
                  onChange={event => setCreateTeamName(event.target.value)}
                  placeholder="예: 클라우드사업팀"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="create-user-role">권한</Label>
                <Select value={createRole} onValueChange={value => setCreateRole(value as UserRole)}>
                  <SelectTrigger id="create-user-role" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="user">user</SelectItem>
                    <SelectItem value="admin">admin</SelectItem>
                    <SelectItem value="super_admin">super_admin</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {createError && (
                <p className="text-xs text-negative" role="alert">{createError}</p>
              )}
            </div>

            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="outline" size="sm" disabled={isCreating}>
                  취소
                </Button>
              </DialogClose>
              <Button type="submit" size="sm" disabled={isCreating}>
                {isCreating ? (
                  <><Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />생성 중...</>
                ) : (
                  '생성'
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
