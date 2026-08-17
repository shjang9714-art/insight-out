'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { SetPasswordForm } from '@/components/login/SetPasswordForm'

const RESEND_COOLDOWN_SECONDS = 60
// Supabase Auth > Email OTP Expiration 설정과 일치시킬 것 — 어긋나면 이 안내가 거짓말이 된다.
const OTP_VALIDITY_SECONDS = 600

type Step = 'password' | 'otp-send' | 'otp-verify' | 'set-password'
type Intent = 'signup' | 'recover'

const REMEMBERED_EMAIL_COOKIE = 'io_remember_email'
const REMEMBERED_EMAIL_MAX_AGE_SECONDS = 60 * 60 * 24 * 180 // 180일

function readCookie(name: string): string | null {
  if (typeof document === 'undefined') return null
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`))
  return match ? decodeURIComponent(match[1]) : null
}

function writeCookie(name: string, value: string, maxAgeSeconds: number) {
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${maxAgeSeconds}; SameSite=Lax`
}

function deleteCookie(name: string) {
  document.cookie = `${name}=; path=/; max-age=0; SameSite=Lax`
}

function MailIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="size-[18px]" aria-hidden="true">
      <rect x="3" y="5" width="18" height="14" rx="2.5" />
      <path d="m4 7 8 6 8-6" />
    </svg>
  )
}

function Spinner() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="size-[18px] animate-spin" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  )
}

function mapAuthError(error: { message?: string; status?: number }): string {
  const message = error.message ?? ''
  if (error.status === 429 || /rate limit|too many/i.test(message)) {
    return '요청이 많습니다. 잠시 후 다시 시도해 주세요.'
  }
  if (error.status === 403 || /lguplus|사내|도메인|not allowed|signups? not allowed/i.test(message)) {
    return '사내 이메일(@lguplus.co.kr) 계정만 로그인할 수 있습니다.'
  }
  if (/expired|invalid|token/i.test(message)) {
    return '인증 코드가 올바르지 않거나 만료되었습니다. 다시 시도해 주세요.'
  }
  return '전송에 실패했습니다. 잠시 후 다시 시도해 주세요.'
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

function formatMmSs(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

export function LoginCard() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const callbackError = searchParams.get('error')
  const passwordUpdated = searchParams.get('password') === 'updated'

  const [step, setStep] = useState<Step>('password')
  const [intent, setIntent] = useState<Intent>('signup')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [showRecovery, setShowRecovery] = useState(false)
  const [loading, setLoading] = useState(false)
  const [rememberEmail, setRememberEmail] = useState(false)
  const [resendCooldown, setResendCooldown] = useState(0)
  const [otpExpiresAt, setOtpExpiresAt] = useState<number | null>(null)
  const [otpRemainingSeconds, setOtpRemainingSeconds] = useState(0)
  const [wasPasswordSet, setWasPasswordSet] = useState(false)
  const codeInputRef = useRef<HTMLInputElement>(null)
  const verifyingRef = useRef(false)

  useEffect(() => {
    if (resendCooldown <= 0) return
    const timer = window.setInterval(() => setResendCooldown((seconds) => Math.max(0, seconds - 1)), 1000)
    return () => window.clearInterval(timer)
  }, [resendCooldown])

  // 인증 코드 남은 유효시간 안내(373) — 실제 만료 판정은 Supabase가 하고, 이건 화면 안내 전용.
  useEffect(() => {
    if (step !== 'otp-verify' || otpExpiresAt === null) return
    const tick = () => setOtpRemainingSeconds(Math.max(0, Math.ceil((otpExpiresAt - Date.now()) / 1000)))
    tick()
    const timer = window.setInterval(tick, 1000)
    return () => window.clearInterval(timer)
  }, [step, otpExpiresAt])

  useEffect(() => {
    if (step === 'otp-verify') codeInputRef.current?.focus()
  }, [step])

  // 아이디(이메일) 기억 — 마운트 시 1회, 쿠키에 저장된 값이 있으면 채워둔다.
  useEffect(() => {
    const saved = readCookie(REMEMBERED_EMAIL_COOKIE)
    if (saved) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- 1회성 마운트 초기화(허용 패턴)
      setEmail(saved)
      setRememberEmail(true)
    }
  }, [])

  // 비밀번호 재설정 후 /login?password=updated 로 돌아왔을 때, 이미 마운트된 카드가
  // 'set-password' 단계에 멈춰 있지 않도록 로그인 폼 상태로 초기화한다.
  // (렌더 중 조정 — setState-in-effect 로 처리하면 react-hooks/set-state-in-effect 에 걸림)
  const [prevPasswordUpdated, setPrevPasswordUpdated] = useState(passwordUpdated)
  if (passwordUpdated !== prevPasswordUpdated) {
    setPrevPasswordUpdated(passwordUpdated)
    if (passwordUpdated) {
      setStep('password')
      setCode('')
      setPassword('')
      setWasPasswordSet(false)
      setLoading(false)
    }
  }

  const handlePasswordLogin = async (event: React.FormEvent) => {
    event.preventDefault()
    const normalizedEmail = email.trim()
    if (!isValidEmail(normalizedEmail)) {
      setError('올바른 이메일 주소를 입력해 주세요.')
      return
    }
    if (!password) {
      setError('비밀번호를 입력해 주세요.')
      return
    }

    setLoading(true)
    setError(null)
    setShowRecovery(false)
    const supabase = createClient()
    const { error: authError } = await supabase.auth.signInWithPassword({
      email: normalizedEmail,
      password,
    })
    if (authError) {
      setError('비밀번호가 올바르지 않거나, 아직 설정되지 않았습니다.')
      setShowRecovery(true)
      setLoading(false)
      return
    }

    if (rememberEmail) {
      writeCookie(REMEMBERED_EMAIL_COOKIE, normalizedEmail, REMEMBERED_EMAIL_MAX_AGE_SECONDS)
    } else {
      deleteCookie(REMEMBERED_EMAIL_COOKIE)
    }

    router.replace('/dashboard')
    router.refresh()
  }

  const sendCode = async (targetEmail: string) => {
    setLoading(true)
    setError(null)
    const supabase = createClient()
    const { error: authError } = await supabase.auth.signInWithOtp({
      email: targetEmail,
      options: { shouldCreateUser: true },
    })
    setLoading(false)
    if (authError) {
      setError(mapAuthError(authError))
      return false
    }
    setResendCooldown(RESEND_COOLDOWN_SECONDS)
    setOtpExpiresAt(Date.now() + OTP_VALIDITY_SECONDS * 1000)
    return true
  }

  const handleOtpSend = async (event: React.FormEvent) => {
    event.preventDefault()
    const normalizedEmail = email.trim()
    if (!isValidEmail(normalizedEmail)) {
      setError('올바른 이메일 주소를 입력해 주세요.')
      return
    }
    setEmail(normalizedEmail)
    if (await sendCode(normalizedEmail)) {
      setCode('')
      setStep('otp-verify')
    }
  }

  const verifyCode = async (token: string) => {
    if (verifyingRef.current) return
    verifyingRef.current = true
    setLoading(true)
    setError(null)
    const supabase = createClient()
    const { error: authError } = await supabase.auth.verifyOtp({ email, token, type: 'email' })
    if (authError) {
      setError('인증 코드가 올바르지 않거나 만료되었습니다. 다시 시도해 주세요.')
      setLoading(false)
      verifyingRef.current = false
      setCode('')
      codeInputRef.current?.focus()
      return
    }

    // 세션 쿠키가 자리잡기 전에 다음 단계로 넘어가면 화면이 안 바뀌는 것처럼 보일 수 있어,
    // 다음 요청(has-password) 전에 세션이 실제로 반영됐는지 확인한다.
    const { data: { user: verifiedUser } } = await supabase.auth.getUser()
    if (!verifiedUser) {
      setError('인증에 실패했습니다. 다시 시도해 주세요.')
      setLoading(false)
      verifyingRef.current = false
      setCode('')
      codeInputRef.current?.focus()
      return
    }

    const response = await fetch('/api/me/has-password', { cache: 'no-store' })
    const result = await response.json() as { hasPassword?: boolean; error?: string }
    if (!response.ok || typeof result.hasPassword !== 'boolean') {
      await supabase.auth.signOut({ scope: 'local' })
      setError(result.error ?? '비밀번호 상태를 확인하지 못했습니다. 다시 시도해 주세요.')
      setLoading(false)
      verifyingRef.current = false
      return
    }

    setWasPasswordSet(result.hasPassword)
    setLoading(false)
    setStep('set-password')
  }

  const handleOtpSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (code.length !== 6) {
      setError('6자리 인증 코드를 입력해 주세요.')
      return
    }
    await verifyCode(code)
  }

  const handleCodeChange = (raw: string) => {
    const digits = raw.replace(/\D/g, '').slice(0, 6)
    setCode(digits)
    if (error) setError(null)
    if (digits.length === 6) void verifyCode(digits)
  }

  const handleResend = async () => {
    if (resendCooldown > 0 || loading) return
    setCode('')
    await sendCode(email)
    codeInputRef.current?.focus()
  }

  const handleAdminGoogle = async () => {
    setLoading(true)
    setError(null)
    const supabase = createClient()
    const { error: authError } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${location.origin}/auth/callback` },
    })
    if (authError) {
      setError('Google 로그인에 실패했습니다.')
      setLoading(false)
    }
  }

  const descriptions: Record<Step, string> = {
    password: '회사 이메일과 비밀번호로 로그인하세요',
    'otp-send': intent === 'recover' ? '가입하신 이메일로 인증 코드를 보냅니다' : '회사 이메일로 인증 코드를 보내 계정을 만듭니다',
    'otp-verify': '메일로 받은 인증 코드를 입력하세요',
    'set-password': intent === 'recover' ? '새 비밀번호를 설정하세요' : '사용하실 비밀번호를 설정하세요',
  }
  const headerTitle = step === 'password' ? '인사이트 아웃' : intent === 'recover' ? '비밀번호 재설정' : '계정 만들기'

  return (
    <div className="w-full rounded-[30px] border border-slate-200/70 bg-white/95 p-8 shadow-[0_40px_90px_-30px_rgba(24,39,75,0.30)] backdrop-blur-sm sm:p-10">
      <div className="mb-9 flex flex-col items-center">
        <h1 className="text-[26px] font-extrabold tracking-tight text-slate-900">{headerTitle}</h1>
        <p className="mt-4 text-sm text-slate-500">{descriptions[step]}</p>
      </div>

      {passwordUpdated && step === 'password' && !error && (
        <div role="status" className="mb-5 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
          비밀번호가 변경되었습니다. 새 비밀번호로 로그인해 주세요.
        </div>
      )}
      {(error || callbackError) && (
        <div role="alert" className="mb-5 rounded-xl border border-destructive/25 bg-destructive/10 p-3 text-sm text-destructive">
          {error ?? callbackError}
        </div>
      )}

      {step === 'password' && (
        <form onSubmit={handlePasswordLogin} className="flex flex-col gap-4">
          <EmailField email={email} setEmail={setEmail} disabled={loading} />
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="password" className="text-slate-700">비밀번호</Label>
            <Input id="password" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required disabled={loading} className="h-12 rounded-xl border-slate-200 bg-white text-[15px] text-slate-900" />
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input
              type="checkbox"
              checked={rememberEmail}
              onChange={(event) => setRememberEmail(event.target.checked)}
              disabled={loading}
              className="size-4 rounded border-slate-300 text-slate-900 focus:ring-slate-900"
            />
            이메일 기억하기
          </label>
          <Button type="submit" disabled={loading} className="mt-2 h-12 w-full gap-2 rounded-xl bg-slate-900 text-[15px] font-semibold text-white hover:bg-slate-800">
            {loading && <Spinner />}{loading ? '로그인 중...' : '로그인'}
          </Button>
          {!showRecovery && (
            <div className="flex items-center justify-between text-sm">
              <button type="button" onClick={() => { setStep('otp-send'); setIntent('recover'); setError(null); setShowRecovery(false) }} className="rounded font-medium text-blue-600 hover:text-blue-700 hover:underline">
                비밀번호를 잊으셨나요
              </button>
              <button type="button" onClick={() => { setStep('otp-send'); setIntent('signup'); setError(null); setShowRecovery(false) }} className="rounded font-medium text-blue-600 hover:text-blue-700 hover:underline">
                처음 오셨나요? 계정 만들기
              </button>
            </div>
          )}
          {showRecovery && (
            <button type="button" onClick={() => { setStep('otp-send'); setIntent('recover'); setError(null); setShowRecovery(false) }} className="rounded text-sm font-semibold text-blue-600 hover:text-blue-700 hover:underline">
              이메일로 인증 코드 받기
            </button>
          )}
        </form>
      )}

      {step === 'otp-send' && (
        <form onSubmit={handleOtpSend} className="flex flex-col gap-4">
          <EmailField email={email} setEmail={setEmail} disabled={loading} />
          <Button type="submit" disabled={loading} className="mt-2 h-12 w-full gap-2 rounded-xl bg-slate-900 text-[15px] font-semibold text-white hover:bg-slate-800">
            {loading && <Spinner />}{loading ? '전송 중...' : '인증 코드 받기'}
          </Button>
          <button type="button" onClick={() => { setStep('password'); setIntent('signup'); setError(null) }} className="rounded text-sm font-medium text-slate-500 hover:text-slate-700 hover:underline">
            비밀번호 로그인으로 돌아가기
          </button>
        </form>
      )}

      {step === 'otp-verify' && (
        <form onSubmit={handleOtpSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="otp-code" className="text-slate-700">인증 코드</Label>
            <Input id="otp-code" ref={codeInputRef} type="text" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} placeholder="······" value={code} onChange={(event) => handleCodeChange(event.target.value)} disabled={loading} aria-describedby="otp-hint" className="h-14 rounded-xl border-slate-200 bg-white text-center text-[24px] font-bold tracking-[0.5em] text-slate-900 placeholder:tracking-[0.3em] placeholder:text-slate-300" />
            <p id="otp-hint" className="mt-0.5 text-xs text-slate-400"><span className="font-medium text-slate-500">{email}</span> 로 6자리 코드를 보냈습니다</p>
            {otpExpiresAt !== null && (
              otpRemainingSeconds > 0 ? (
                <p className="mt-1 text-xs text-slate-400">
                  코드는 10분간 유효합니다 · 유효시간 <span className="font-medium tabular-nums text-slate-500">{formatMmSs(otpRemainingSeconds)}</span>
                </p>
              ) : (
                <p role="alert" className="mt-1 text-xs font-medium text-destructive">
                  코드가 만료되었습니다. 재전송해 주세요.
                </p>
              )
            )}
          </div>
          <Button type="submit" disabled={loading || code.length !== 6} className="mt-2 h-12 w-full gap-2 rounded-xl bg-slate-900 text-[15px] font-semibold text-white hover:bg-slate-800">
            {loading && <Spinner />}{loading ? '확인 중...' : '확인'}
          </Button>
          <div className="flex items-center justify-between pt-0.5 text-sm">
            <button type="button" onClick={handleResend} disabled={resendCooldown > 0 || loading} className="rounded font-medium text-blue-600 hover:text-blue-700 disabled:cursor-not-allowed disabled:text-slate-300">
              {resendCooldown > 0 ? `코드 재전송 (${resendCooldown}s)` : '코드 재전송'}
            </button>
            <button type="button" onClick={() => { setStep('otp-send'); setCode(''); setError(null) }} disabled={loading} className="rounded font-medium text-slate-500 hover:text-slate-700">
              이메일 변경
            </button>
          </div>
        </form>
      )}

      {step === 'set-password' && <SetPasswordForm wasPasswordSet={wasPasswordSet} onLoadingChange={setLoading} />}

      {step !== 'set-password' && (
        <div className="mt-8 flex justify-center border-t border-slate-100 pt-5">
          <button type="button" onClick={handleAdminGoogle} disabled={loading} className="rounded text-xs text-slate-400 hover:text-slate-600 hover:underline">
            관리자 로그인
          </button>
        </div>
      )}
    </div>
  )
}

function EmailField({ email, setEmail, disabled }: { email: string; setEmail: (email: string) => void; disabled: boolean }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor="email" className="text-slate-700">회사 이메일</Label>
      <div className="relative">
        <span className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-slate-400"><MailIcon /></span>
        <Input id="email" type="email" placeholder="name@lguplus.co.kr" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required disabled={disabled} className="h-12 rounded-xl border-slate-200 bg-white pl-11 text-[15px] text-slate-900 placeholder:text-slate-400" />
      </div>
      <p className="mt-0.5 text-xs text-slate-400">사내 이메일(@lguplus.co.kr)로 로그인하세요</p>
    </div>
  )
}
