'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

interface SetPasswordFormProps {
  wasPasswordSet: boolean
  onLoadingChange?: (loading: boolean) => void
}

export function SetPasswordForm({ wasPasswordSet, onLoadingChange }: SetPasswordFormProps) {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const setBusy = (value: boolean) => {
    setLoading(value)
    onLoadingChange?.(value)
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (password.length < 8) {
      setError('비밀번호는 8자 이상이어야 합니다.')
      return
    }
    if (password !== confirmation) {
      setError('비밀번호 확인이 일치하지 않습니다.')
      return
    }

    setBusy(true)
    setError(null)
    const supabase = createClient()
    const { error: updateError } = await supabase.auth.updateUser({ password })
    if (updateError) {
      setError('비밀번호를 설정하지 못했습니다. 잠시 후 다시 시도해 주세요.')
      setBusy(false)
      return
    }

    const cacheResponse = await fetch('/api/me/has-password', { method: 'DELETE' })
    if (!cacheResponse.ok) {
      setError('비밀번호는 설정됐지만 로그인 상태를 갱신하지 못했습니다. 다시 시도해 주세요.')
      setBusy(false)
      return
    }

    if (wasPasswordSet) {
      const { error: signOutError } = await supabase.auth.signOut({ scope: 'global' })
      if (signOutError) {
        setError('기존 로그인 세션을 종료하지 못했습니다. 다시 시도해 주세요.')
        setBusy(false)
        return
      }
      router.replace('/login?password=updated')
      router.refresh()
      return
    }

    router.replace('/dashboard')
    router.refresh()
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="new-password" className="text-slate-700">새 비밀번호</Label>
        <Input
          id="new-password"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          disabled={loading}
          minLength={8}
          required
          className="h-12 rounded-xl border-slate-200 bg-white text-[15px] text-slate-900"
        />
        <p className="text-xs text-slate-400">8자 이상 입력해 주세요.</p>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="new-password-confirmation" className="text-slate-700">비밀번호 확인</Label>
        <Input
          id="new-password-confirmation"
          type="password"
          autoComplete="new-password"
          value={confirmation}
          onChange={(event) => setConfirmation(event.target.value)}
          disabled={loading}
          minLength={8}
          required
          className="h-12 rounded-xl border-slate-200 bg-white text-[15px] text-slate-900"
        />
      </div>
      {error && (
        <div role="alert" className="rounded-xl border border-destructive/25 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}
      <Button type="submit" disabled={loading} className="mt-2 h-12 w-full rounded-xl bg-slate-900 text-[15px] font-semibold text-white hover:bg-slate-800">
        {loading ? '설정 중...' : '비밀번호 설정'}
      </Button>
    </form>
  )
}
