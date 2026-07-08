'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Loader2, ShieldCheck, ShieldOff, CheckCircle, XCircle, Clock } from 'lucide-react'
import AdminErrorBox from '@/components/admin/ui/AdminErrorBox'
import StatusBadge from '@/components/admin/ui/StatusBadge'
import { updateUserRole, promoteByEmail, approveUser, rejectUser } from '@/app/admin/users/actions'
import type { UserRole, ApprovalStatus } from '@/lib/types'

interface UserRow {
  id: string
  email: string
  name: string
  department: string | null
  team: string | null
  position: string | null
  role: UserRole
  approval_status: ApprovalStatus
  created_at: string
}

interface Props {
  initialUsers: UserRow[]
}

export default function UserManager({ initialUsers }: Props) {
  const [users, setUsers] = useState<UserRow[]>(initialUsers)
  const [error, setError] = useState<string | null>(null)
  const [togglingId, setTogglingId] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const [emailInput, setEmailInput] = useState('')
  const [formError, setFormError] = useState<string | null>(null)
  const [formSuccess, setFormSuccess] = useState<string | null>(null)
  const [isPromoting, setIsPromoting] = useState(false)

  // ── role 토글 ──────────────────────────────────────────────────────────────

  const handleToggleRole = (user: UserRow) => {
    const newRole: UserRole = user.role === 'admin' ? 'user' : 'admin'
    const label = newRole === 'admin' ? 'admin으로 승격' : '일반 user로 변경'
    if (!window.confirm(`${user.email}\n\n${label}하시겠습니까?`)) return

    setTogglingId(user.id)
    startTransition(async () => {
      const { error: err } = await updateUserRole(user.id, newRole)
      if (err) {
        setError(err)
      } else {
        setUsers(prev =>
          prev.map(u => u.id === user.id ? { ...u, role: newRole } : u)
        )
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
          return [promoted, ...prev]
        })
        setFormSuccess(`${promoted.email} 계정이 admin으로 변경되었습니다.`)
        setEmailInput('')
      }
    } finally {
      setIsPromoting(false)
    }
  }

  // ── 승인/거절 ──────────────────────────────────────────────────────────────
  const [approvingId, setApprovingId] = useState<string | null>(null)

  const handleApprove = (user: UserRow) => {
    if (!window.confirm(`${user.email}\n\n가입을 승인하시겠습니까?`)) return
    setApprovingId(user.id)
    startTransition(async () => {
      const { error: err } = await approveUser(user.id)
      if (err) {
        setError(err)
      } else {
        setUsers(prev => prev.map(u => u.id === user.id ? { ...u, approval_status: 'approved' } : u))
      }
      setApprovingId(null)
    })
  }

  const handleReject = (user: UserRow) => {
    if (!window.confirm(`${user.email}\n\n가입을 거절하시겠습니까?`)) return
    setApprovingId(user.id)
    startTransition(async () => {
      const { error: err } = await rejectUser(user.id)
      if (err) {
        setError(err)
      } else {
        setUsers(prev => prev.map(u => u.id === user.id ? { ...u, approval_status: 'rejected' } : u))
      }
      setApprovingId(null)
    })
  }

  // ── 렌더 ──────────────────────────────────────────────────────────────────

  const pendingUsers = users.filter(u => u.approval_status === 'pending')
  const adminCount = users.filter(u => u.role === 'admin').length

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

      {/* ── 승인 대기 섹션 ── */}
      {pendingUsers.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <Clock className="h-4 w-4 text-amber-500" />
              승인 대기 ({pendingUsers.length}명)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="divide-y divide-border rounded-lg border border-border">
              {pendingUsers.map(u => (
                <div key={u.id} className="flex items-center justify-between px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground">{u.email}</p>
                    <p className="text-xs text-muted-foreground">
                      {u.name || '이름 미입력'} · {u.department || '부서 미입력'} · {u.team || '팀 미입력'}
                    </p>
                  </div>
                  <div className="ml-4 flex items-center gap-2">
                    <Button
                      size="sm"
                      onClick={() => handleApprove(u)}
                      disabled={approvingId === u.id || isPending}
                    >
                      {approvingId === u.id ? (
                        <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                      ) : (
                        <CheckCircle className="mr-1 h-3 w-3" />
                      )}
                      승인
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => handleReject(u)}
                      disabled={approvingId === u.id || isPending}
                    >
                      {approvingId === u.id ? (
                        <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                      ) : (
                        <XCircle className="mr-1 h-3 w-3" />
                      )}
                      거절
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── 목록 헤더 ── */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          전체 {users.length}명 · admin {adminCount}명
        </p>
      </div>

      {/* ── 사용자 테이블 ── */}
      {users.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border py-16 text-center text-sm text-muted-foreground">
          등록된 사용자가 없습니다.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <table className="w-full min-w-[700px] text-sm">
            <thead>
              <tr className="border-b border-border bg-muted text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-3">이메일</th>
                <th className="px-4 py-3">이름</th>
                <th className="px-4 py-3">부서</th>
                <th className="px-4 py-3">권한</th>
                <th className="px-4 py-3">승인</th>
                <th className="px-4 py-3">가입일</th>
                <th className="px-4 py-3 text-right">작업</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {users.map(u => (
                <tr key={u.id} className="transition-colors hover:bg-accent/50">
                  <td className="max-w-[200px] truncate px-4 py-3 font-medium text-foreground" title={u.email}>{u.email}</td>
                  <td className="max-w-[200px] truncate px-4 py-3 text-muted-foreground" title={u.name ?? undefined}>{u.name || <span className="text-muted-foreground/40">—</span>}</td>
                  <td className="px-4 py-3">
                    {u.department ? (
                      <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs text-muted-foreground">
                        {u.department}
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground/40">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {u.role === 'admin' ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-brand-600/10 px-2.5 py-0.5 text-xs font-semibold text-brand-600">
                        <ShieldCheck className="h-3 w-3" />
                        admin
                      </span>
                    ) : (
                      <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs text-muted-foreground">
                        user
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {u.approval_status === 'approved' ? (
                      <Badge variant="outline" className="border-positive/30 bg-positive-soft text-positive">승인</Badge>
                    ) : u.approval_status === 'rejected' ? (
                      <StatusBadge tone="negative" label="거절" />
                    ) : (
                      <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-700">대기</Badge>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {new Date(u.created_at).toLocaleDateString('ko-KR')}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      {u.approval_status !== 'approved' && (
                        <button
                          onClick={() => handleApprove(u)}
                          disabled={approvingId === u.id || isPending}
                          className="inline-flex items-center gap-1 rounded bg-positive-soft px-2.5 py-1.5 text-xs font-medium text-positive transition-colors disabled:opacity-40"
                        >
                          {approvingId === u.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle className="h-3 w-3" />}
                          승인
                        </button>
                      )}
                      {u.approval_status !== 'rejected' && u.approval_status !== 'approved' && (
                        <button
                          onClick={() => handleReject(u)}
                          disabled={approvingId === u.id || isPending}
                          className="inline-flex items-center gap-1 rounded bg-destructive/10 px-2.5 py-1.5 text-xs font-medium text-destructive transition-colors disabled:opacity-40"
                        >
                          {approvingId === u.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <XCircle className="h-3 w-3" />}
                          거절
                        </button>
                      )}
                      <button
                        onClick={() => handleToggleRole(u)}
                        disabled={togglingId === u.id || isPending}
                        className="inline-flex items-center gap-1 rounded px-2.5 py-1.5 text-xs font-medium transition-colors disabled:opacity-40"
                        style={
                          u.role === 'admin'
                            ? { background: 'rgb(254 242 242)', color: 'rgb(220 38 38)' }
                            : { background: 'rgb(240 253 244)', color: 'rgb(22 163 74)' }
                        }
                      >
                        {togglingId === u.id ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : u.role === 'admin' ? (
                          <><ShieldOff className="h-3 w-3" />user로 변경</>
                        ) : (
                          <><ShieldCheck className="h-3 w-3" />admin으로 승격</>
                        )}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
