'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Loader2, ShieldCheck, ShieldOff } from 'lucide-react'
import { updateUserRole, promoteByEmail } from '@/app/admin/users/actions'
import type { UserRole } from '@/lib/types'

interface UserRow {
  id: string
  email: string
  name: string
  department: string | null
  team: string | null
  position: string | null
  role: UserRole
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

  // ── 렌더 ──────────────────────────────────────────────────────────────────

  const adminCount = users.filter(u => u.role === 'admin').length

  return (
    <div className="space-y-6">
      {/* 전역 오류 */}
      {error && (
        <div className="flex items-start justify-between rounded-lg border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">
          <span>{error}</span>
          <button
            onClick={() => setError(null)}
            className="ml-4 shrink-0 text-red-400 underline hover:text-red-600"
          >
            닫기
          </button>
        </div>
      )}

      {/* ── 이메일로 admin 추가 폼 ── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold text-gray-700">
            이메일로 admin 권한 부여
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handlePromote} className="space-y-3">
            {formError && (
              <div className="rounded-lg border border-red-100 bg-red-50 px-4 py-2 text-sm text-red-600">
                {formError}
              </div>
            )}
            {formSuccess && (
              <div className="rounded-lg border border-green-100 bg-green-50 px-4 py-2 text-sm text-green-700">
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
        <p className="text-sm text-gray-500">
          전체 {users.length}명 · admin {adminCount}명
        </p>
      </div>

      {/* ── 사용자 테이블 ── */}
      {users.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-200 py-16 text-center text-sm text-gray-400">
          등록된 사용자가 없습니다.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-100 bg-white">
          <table className="w-full min-w-[700px] text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-400">
                <th className="px-4 py-3">이메일</th>
                <th className="px-4 py-3">이름</th>
                <th className="px-4 py-3">부서</th>
                <th className="px-4 py-3">권한</th>
                <th className="px-4 py-3">가입일</th>
                <th className="px-4 py-3 text-right">작업</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {users.map(u => (
                <tr key={u.id} className="transition-colors hover:bg-gray-50/60">
                  <td className="px-4 py-3 font-medium text-gray-900">{u.email}</td>
                  <td className="px-4 py-3 text-gray-600">{u.name || <span className="text-gray-300">—</span>}</td>
                  <td className="px-4 py-3">
                    {u.department ? (
                      <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs text-gray-600">
                        {u.department}
                      </span>
                    ) : (
                      <span className="text-xs text-gray-300">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {u.role === 'admin' ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-brand-600/10 px-2.5 py-0.5 text-xs font-semibold text-brand-600">
                        <ShieldCheck className="h-3 w-3" />
                        admin
                      </span>
                    ) : (
                      <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs text-gray-500">
                        user
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-400">
                    {new Date(u.created_at).toLocaleDateString('ko-KR')}
                  </td>
                  <td className="px-4 py-3 text-right">
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
