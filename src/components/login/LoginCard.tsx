'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

/**
 * LoginCard — 회사 이메일(@lguplus.co.kr) 6자리 OTP 2단계 로그인 (지시서 239)
 * + 관리자 Google 저강조 보조 진입 (지시서 240).
 *
 * - 1단계: signInWithOtp(shouldCreateUser:true) → 도메인 게이팅은 서버 Hook 담당
 *   (클라이언트 도메인 하드검증 금지 — allowlist 예외계정 보호).
 * - 2단계: verifyOtp(type:'email') → 성공 시 /dashboard (콜백 불필요).
 * - 재전송 30s 쿨다운 · 이메일 변경 · 6자리 입력 시 자동 제출.
 * - 관리자 Google: OAuth → /auth/callback (기존 유지). 비관리자는 Hook이 거부.
 */

const RESEND_COOLDOWN_SECONDS = 30

type Step = 'email' | 'otp'

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-[13px]" aria-hidden="true">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05" />
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
    </svg>
  )
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

/** Supabase 에러 → 사용자 친화 한국어 메시지 (지시서 239 §3) */
function mapAuthError(err: { message?: string; status?: number }): string {
  const msg = err.message ?? ''
  if (err.status === 429 || /rate limit|too many/i.test(msg)) {
    return '요청이 많습니다. 잠시 후 다시 시도해 주세요.'
  }
  // Before-User-Created Hook 거부(403) — Hook 메시지에 도메인 안내 포함
  if (err.status === 403 || /lguplus|사내|도메인|not allowed|signups? not allowed/i.test(msg)) {
    return '사내 이메일(@lguplus.co.kr) 계정만 로그인할 수 있습니다.'
  }
  if (/expired|invalid|token/i.test(msg)) {
    return '인증 코드가 올바르지 않거나 만료되었습니다. 다시 시도해 주세요.'
  }
  return '전송에 실패했습니다. 잠시 후 다시 시도해 주세요.'
}

export function LoginCard() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const callbackError = searchParams.get('error')

  const [step, setStep] = useState<Step>('email')
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [resendCooldown, setResendCooldown] = useState(0)
  const codeInputRef = useRef<HTMLInputElement>(null)
  const verifyingRef = useRef(false)

  // 재전송 쿨다운 타이머
  useEffect(() => {
    if (resendCooldown <= 0) return
    const t = setInterval(() => setResendCooldown((s) => (s > 0 ? s - 1 : 0)), 1000)
    return () => clearInterval(t)
  }, [resendCooldown])

  // OTP 단계 진입 시 코드 인풋 포커스
  useEffect(() => {
    if (step === 'otp') codeInputRef.current?.focus()
  }, [step])

  const sendCode = useCallback(
    async (targetEmail: string) => {
      setLoading(true)
      setError(null)
      const supabase = createClient()
      const { error: authError } = await supabase.auth.signInWithOtp({
        email: targetEmail,
        options: { shouldCreateUser: true }, // 최초 임직원 가입 허용 — 도메인 게이팅은 서버 Hook
      })
      setLoading(false)
      if (authError) {
        setError(mapAuthError(authError))
        return false
      }
      setResendCooldown(RESEND_COOLDOWN_SECONDS)
      return true
    },
    [],
  )

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = email.trim()
    // 클라이언트는 형식만 가드 — 도메인 판정은 서버 Hook (allowlist 예외 보호)
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setError('올바른 이메일 주소를 입력해 주세요.')
      return
    }
    setEmail(trimmed)
    const ok = await sendCode(trimmed)
    if (ok) {
      setCode('')
      setStep('otp')
    }
  }

  const verifyCode = useCallback(
    async (token: string) => {
      if (verifyingRef.current) return
      verifyingRef.current = true
      setLoading(true)
      setError(null)
      const supabase = createClient()
      const { error: authError } = await supabase.auth.verifyOtp({
        email,
        token,
        type: 'email',
      })
      if (authError) {
        setError('인증 코드가 올바르지 않거나 만료되었습니다. 다시 시도해 주세요.')
        setLoading(false)
        verifyingRef.current = false
        setCode('')
        codeInputRef.current?.focus()
        return
      }
      router.push('/dashboard')
      router.refresh()
    },
    [email, router],
  )

  const handleOtpSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
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
    if (digits.length === 6) void verifyCode(digits) // 6자리 채워지면 자동 제출
  }

  const handleResend = async () => {
    if (resendCooldown > 0 || loading) return
    setCode('')
    await sendCode(email)
    codeInputRef.current?.focus()
  }

  const handleChangeEmail = () => {
    setStep('email')
    setCode('')
    setError(null)
  }

  // 관리자 Google 보조 진입 (지시서 240) — 저강조, Hook이 비관리자 차단
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

  return (
    <div className="w-full rounded-[30px] border border-slate-200/70 bg-white/95 p-8 shadow-[0_40px_90px_-30px_rgba(24,39,75,0.30)] backdrop-blur-sm sm:p-10">
      {/* 카드 타이틀 — 텍스트 중앙 정렬 + 골드 언더바 */}
      <div className="mb-9 flex flex-col items-center">
        <h1 className="text-[26px] font-extrabold tracking-tight text-slate-900">Insight Out</h1>
        <span
          aria-hidden="true"
          className="mt-3.5 h-[3px] w-[30px] rounded-full"
          style={{
            background: 'linear-gradient(90deg, rgba(246,205,93,0), #e8b638 24%, #f6d36a 50%, #e8b638 76%, rgba(246,205,93,0))',
            boxShadow: '0 2px 8px rgba(232,182,56,.32)',
          }}
        />
        <p className="mt-4 text-sm text-slate-500">
          {step === 'email' ? '사내 이메일로 로그인하세요' : '메일로 받은 인증 코드를 입력하세요'}
        </p>
      </div>

      {(error || callbackError) && (
        <div
          role="alert"
          className="mb-5 rounded-xl border border-destructive/25 bg-destructive/10 p-3 text-sm text-destructive"
        >
          {error ?? decodeURIComponent(callbackError!)}
        </div>
      )}

      {step === 'email' ? (
        <form onSubmit={handleEmailSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="email" className="text-slate-700">회사 이메일</Label>
            <div className="relative">
              <span className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-slate-400">
                <MailIcon />
              </span>
              <Input
                id="email"
                type="email"
                placeholder="name@lguplus.co.kr"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={loading}
                className="h-12 rounded-xl border-slate-200 bg-white pl-11 text-[15px] text-slate-900 placeholder:text-slate-400"
              />
            </div>
            <p className="mt-0.5 text-xs text-slate-400">사내 이메일(@lguplus.co.kr)로 로그인하세요</p>
          </div>

          <Button
            type="submit"
            disabled={loading}
            className="mt-2 h-12 w-full gap-2 rounded-xl bg-gradient-to-b from-[#233052] to-[#131c33] text-[15px] font-semibold text-white shadow-[0_10px_24px_-10px_rgba(19,28,51,0.55)] transition-transform hover:-translate-y-px hover:from-[#28365c] hover:to-[#182240]"
          >
            {loading && <Spinner />}
            {loading ? '전송 중...' : '인증 코드 받기'}
          </Button>
        </form>
      ) : (
        <form onSubmit={handleOtpSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="otp-code" className="text-slate-700">인증 코드</Label>
            <Input
              id="otp-code"
              ref={codeInputRef}
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6}"
              maxLength={6}
              placeholder="······"
              value={code}
              onChange={(e) => handleCodeChange(e.target.value)}
              disabled={loading}
              aria-describedby="otp-hint"
              className="h-14 rounded-xl border-slate-200 bg-white text-center text-[24px] font-bold tracking-[0.5em] text-slate-900 placeholder:tracking-[0.3em] placeholder:text-slate-300"
            />
            <p id="otp-hint" className="mt-0.5 text-xs text-slate-400">
              <span className="font-medium text-slate-500">{email}</span> 로 6자리 코드를 보냈습니다
            </p>
          </div>

          <Button
            type="submit"
            disabled={loading || code.length !== 6}
            className="mt-2 h-12 w-full gap-2 rounded-xl bg-gradient-to-b from-[#233052] to-[#131c33] text-[15px] font-semibold text-white shadow-[0_10px_24px_-10px_rgba(19,28,51,0.55)] transition-transform hover:-translate-y-px"
          >
            {loading && <Spinner />}
            {loading ? '확인 중...' : '확인'}
          </Button>

          <div className="flex items-center justify-between pt-0.5 text-sm">
            <button
              type="button"
              onClick={handleResend}
              disabled={resendCooldown > 0 || loading}
              className="rounded font-medium text-[#2563eb] transition-colors hover:text-[#1d4ed8] focus-visible:ring-2 focus-visible:ring-blue-300 focus-visible:outline-none disabled:cursor-not-allowed disabled:text-slate-300"
            >
              {resendCooldown > 0 ? `코드 재전송 (${resendCooldown}s)` : '코드 재전송'}
            </button>
            <button
              type="button"
              onClick={handleChangeEmail}
              disabled={loading}
              className="rounded font-medium text-slate-500 transition-colors hover:text-slate-700 focus-visible:ring-2 focus-visible:ring-slate-300 focus-visible:outline-none"
            >
              이메일 변경
            </button>
          </div>
        </form>
      )}

      {/* 관리자 보조 진입 — 저강조 (지시서 240) */}
      <div className="mt-8 flex justify-center border-t border-slate-100 pt-5">
        <button
          type="button"
          onClick={handleAdminGoogle}
          disabled={loading}
          className="inline-flex items-center gap-1.5 rounded text-xs text-slate-400 transition-colors hover:text-slate-600 hover:underline focus-visible:ring-2 focus-visible:ring-slate-300 focus-visible:outline-none"
        >
          <GoogleIcon />
          관리자는 Google로 로그인
        </button>
      </div>
    </div>
  )
}
