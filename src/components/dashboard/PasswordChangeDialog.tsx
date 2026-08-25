'use client'

import { useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { createClient } from '@/lib/supabase/client'

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  authEmail: string
}

/** 572 — SecurityTab(F-02)의 비밀번호 변경 로직을 그대로 옮긴 헤더 팝업. */
export default function PasswordChangeDialog({ open, onOpenChange, authEmail }: Props) {
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [newPasswordConfirm, setNewPasswordConfirm] = useState('')
  const [status, setStatus] = useState<SaveStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const resetForm = () => {
    setCurrentPassword('')
    setNewPassword('')
    setNewPasswordConfirm('')
    setStatus('idle')
    setError(null)
    setSuccess(null)
  }

  const handleOpenChange = (next: boolean) => {
    if (!next && status !== 'saving') resetForm()
    onOpenChange(next)
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setSuccess(null)

    if (!currentPassword) {
      setError('현재 비밀번호를 입력해주세요.')
      return
    }
    if (newPassword.length < 8) {
      setError('새 비밀번호는 8자 이상이어야 합니다.')
      return
    }
    if (newPassword !== newPasswordConfirm) {
      setError('새 비밀번호 확인이 일치하지 않습니다.')
      return
    }

    setStatus('saving')
    const supabase = createClient()

    // 재인증 — 현재 비밀번호가 맞는지 확인 후에만 변경을 시도한다.
    const { error: reauthError } = await supabase.auth.signInWithPassword({
      email: authEmail,
      password: currentPassword,
    })
    if (reauthError) {
      setError('현재 비밀번호가 올바르지 않습니다.')
      setStatus('error')
      return
    }

    const { error: updateError } = await supabase.auth.updateUser({ password: newPassword })
    if (updateError) {
      setError('비밀번호 변경에 실패했습니다. 잠시 후 다시 시도해주세요.')
      setStatus('error')
      return
    }

    setCurrentPassword('')
    setNewPassword('')
    setNewPasswordConfirm('')
    setStatus('saved')
    setSuccess('비밀번호가 변경되었습니다. 이 기기는 로그인 상태가 유지되고, 다른 기기는 모두 로그아웃됩니다.')
    setTimeout(() => setStatus('idle'), 4000)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>비밀번호 변경</DialogTitle>
          <DialogDescription>현재 비밀번호를 확인한 뒤 새 비밀번호로 변경합니다.</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="header-current-password">현재 비밀번호 <span className="text-negative">*</span></Label>
            <Input
              id="header-current-password"
              type="password"
              autoComplete="current-password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              autoFocus
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="header-new-password">새 비밀번호 <span className="text-negative">*</span></Label>
              <Input
                id="header-new-password"
                type="password"
                autoComplete="new-password"
                minLength={8}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="header-new-password-confirm">새 비밀번호 확인 <span className="text-negative">*</span></Label>
              <Input
                id="header-new-password-confirm"
                type="password"
                autoComplete="new-password"
                minLength={8}
                value={newPasswordConfirm}
                onChange={(e) => setNewPasswordConfirm(e.target.value)}
              />
            </div>
          </div>

          {error && <p className="text-xs text-negative">{error}</p>}
          {success && <p className="text-xs text-emerald-600">{success}</p>}

          <Button type="submit" disabled={status === 'saving'} className="mt-1 h-10 w-full">
            {status === 'saving' ? '변경 중...' : status === 'saved' ? '변경되었습니다!' : '비밀번호 변경'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}
