'use client'

import { useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { ShieldAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog'
import { createClient } from '@/lib/supabase/client'
import { changeEmail, deactivateAccount } from '@/app/dashboard/mypage/actions'
import type { SaveStatus } from './types'

interface Props {
  authEmail: string
}

export default function SecurityTab({ authEmail }: Props) {
  const router = useRouter()

  // F-02 — 세션 중 비밀번호 변경
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [newPasswordConfirm, setNewPasswordConfirm] = useState('')
  const [passwordStatus, setPasswordStatus] = useState<SaveStatus>('idle')
  const [passwordError, setPasswordError] = useState<string | null>(null)
  const [passwordSuccess, setPasswordSuccess] = useState<string | null>(null)

  // F-06 — 이메일 변경
  const [newEmail, setNewEmail] = useState('')
  const [emailStatus, setEmailStatus] = useState<SaveStatus>('idle')
  const [emailError, setEmailError] = useState<string | null>(null)
  const [emailSuccess, setEmailSuccess] = useState<string | null>(null)

  // F-09 — 계정 비활성화
  const [deactivateOpen, setDeactivateOpen] = useState(false)
  const [deactivating, setDeactivating] = useState(false)
  const [deactivateError, setDeactivateError] = useState<string | null>(null)

  const handlePasswordChange = async (e: FormEvent) => {
    e.preventDefault()
    setPasswordError(null)
    setPasswordSuccess(null)

    if (!currentPassword) {
      setPasswordError('현재 비밀번호를 입력해주세요.')
      return
    }
    if (newPassword.length < 8) {
      setPasswordError('새 비밀번호는 8자 이상이어야 합니다.')
      return
    }
    if (newPassword !== newPasswordConfirm) {
      setPasswordError('새 비밀번호 확인이 일치하지 않습니다.')
      return
    }

    setPasswordStatus('saving')
    const supabase = createClient()

    // 재인증 — 현재 비밀번호가 맞는지 확인 후에만 변경을 시도한다.
    const { error: reauthError } = await supabase.auth.signInWithPassword({
      email: authEmail,
      password: currentPassword,
    })
    if (reauthError) {
      setPasswordError('현재 비밀번호가 올바르지 않습니다.')
      setPasswordStatus('error')
      return
    }

    const { error: updateError } = await supabase.auth.updateUser({ password: newPassword })
    if (updateError) {
      setPasswordError('비밀번호 변경에 실패했습니다. 잠시 후 다시 시도해주세요.')
      setPasswordStatus('error')
      return
    }

    setCurrentPassword('')
    setNewPassword('')
    setNewPasswordConfirm('')
    setPasswordStatus('saved')
    setPasswordSuccess('비밀번호가 변경되었습니다. 이 기기는 로그인 상태가 유지되고, 다른 기기는 모두 로그아웃됩니다.')
    setTimeout(() => setPasswordStatus('idle'), 4000)
  }

  const handleEmailChange = async (e: FormEvent) => {
    e.preventDefault()
    setEmailError(null)
    setEmailSuccess(null)

    const trimmed = newEmail.trim()
    if (!trimmed) {
      setEmailError('변경할 이메일 주소를 입력해주세요.')
      return
    }

    setEmailStatus('saving')
    const result = await changeEmail(trimmed)
    if (result.error) {
      setEmailError(result.error)
      setEmailStatus('error')
      return
    }

    setNewEmail('')
    setEmailStatus('saved')
    setEmailSuccess('변경 확인 메일을 보냈습니다. 메일함에서 링크를 확인해야 변경이 완료됩니다.')
    setTimeout(() => setEmailStatus('idle'), 4000)
  }

  const handleDeactivate = async () => {
    setDeactivating(true)
    setDeactivateError(null)

    const result = await deactivateAccount()
    if (result.error) {
      setDeactivateError(result.error)
      setDeactivating(false)
      return
    }

    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-border bg-card p-6 shadow-sm">
        <h2 className="mb-5 text-base font-semibold text-foreground">비밀번호 변경</h2>

        <form onSubmit={handlePasswordChange} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="current-password">현재 비밀번호 <span className="text-negative">*</span></Label>
            <Input
              id="current-password"
              type="password"
              autoComplete="current-password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="new-password">새 비밀번호 <span className="text-negative">*</span></Label>
              <Input
                id="new-password"
                type="password"
                autoComplete="new-password"
                minLength={8}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="new-password-confirm">새 비밀번호 확인 <span className="text-negative">*</span></Label>
              <Input
                id="new-password-confirm"
                type="password"
                autoComplete="new-password"
                minLength={8}
                value={newPasswordConfirm}
                onChange={(e) => setNewPasswordConfirm(e.target.value)}
              />
            </div>
          </div>

          {passwordError && <p className="text-xs text-negative">{passwordError}</p>}
          {passwordSuccess && <p className="text-xs text-emerald-600">{passwordSuccess}</p>}

          <Button type="submit" disabled={passwordStatus === 'saving'} className="mt-1 h-10 w-full">
            {passwordStatus === 'saving' ? '변경 중...' : passwordStatus === 'saved' ? '변경되었습니다!' : '비밀번호 변경'}
          </Button>
        </form>
      </section>

      <section className="rounded-xl border border-border bg-card p-6 shadow-sm">
        <h2 className="mb-5 text-base font-semibold text-foreground">이메일 변경</h2>

        <form onSubmit={handleEmailChange} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="current-email">현재 이메일</Label>
            <Input id="current-email" value={authEmail} readOnly className="bg-muted text-muted-foreground" />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="new-email">새 이메일 <span className="text-negative">*</span></Label>
            <Input
              id="new-email"
              type="email"
              placeholder="name@lguplus.co.kr"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">사내 이메일(@lguplus.co.kr) 또는 허용된 이메일만 사용할 수 있습니다.</p>
          </div>

          {emailError && <p className="text-xs text-negative">{emailError}</p>}
          {emailSuccess && <p className="text-xs text-emerald-600">{emailSuccess}</p>}

          <Button type="submit" disabled={emailStatus === 'saving'} className="mt-1 h-10 w-full">
            {emailStatus === 'saving' ? '요청 중...' : emailStatus === 'saved' ? '요청되었습니다!' : '이메일 변경'}
          </Button>
        </form>
      </section>

      <section className="rounded-xl border border-destructive/30 bg-card p-6 shadow-sm">
        <h2 className="mb-1 text-base font-semibold text-foreground">계정 비활성화</h2>
        <p className="mb-5 text-xs text-muted-foreground">
          비활성화하면 즉시 로그아웃되고 다시 로그인할 수 없습니다. 복구는 관리자에게 문의해주세요.
        </p>

        <Dialog open={deactivateOpen} onOpenChange={setDeactivateOpen}>
          <DialogTrigger asChild>
            <Button type="button" variant="outline" className="gap-1.5 text-negative hover:text-negative">
              <ShieldAlert className="h-3.5 w-3.5" />
              계정 비활성화
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>계정을 비활성화하시겠습니까?</DialogTitle>
              <DialogDescription>
                즉시 모든 기기에서 로그아웃되며, 다시 로그인할 수 없습니다. 계정 복구는 관리자만 할 수 있습니다.
              </DialogDescription>
            </DialogHeader>

            {deactivateError && <p className="text-xs text-negative">{deactivateError}</p>}

            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="outline" disabled={deactivating}>취소</Button>
              </DialogClose>
              <Button
                type="button"
                variant="destructive"
                disabled={deactivating}
                onClick={handleDeactivate}
              >
                {deactivating ? '처리 중...' : '비활성화'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </section>
    </div>
  )
}
