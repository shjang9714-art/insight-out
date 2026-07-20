'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Progress } from '@/components/ui/progress'
import Step1Profile from '@/components/onboarding/Step1Profile'
import { completeOnboarding } from '@/app/onboarding/actions'
import type { OnboardingStep1 } from '@/lib/types'

const STEPS = ['프로필 등록']

// 제출 실패(특히 "unexpected response" 류)에 대비한 안전장치용 sessionStorage 키.
// 원인(미들웨어 리다이렉트 등)을 고쳐도 배포 환경 변수·네트워크 문제로 재발할 수 있어
// 별도 방어선을 둔다: 실패 시 입력값을 저장하고 새로고침 → 복원 후 자동 재제출(최대 1회).
const PENDING_SUBMIT_KEY = 'onboarding-pending-submit'
const RETRY_FLAG_KEY = 'onboarding-auto-retried'

function isUnexpectedResponseError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err)
  return /unexpected response/i.test(message)
}

function readPendingSubmit(): OnboardingStep1 | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.sessionStorage.getItem(PENDING_SUBMIT_KEY)
    return raw ? (JSON.parse(raw) as OnboardingStep1) : null
  } catch {
    return null
  }
}

const EMPTY_STEP1_DATA: OnboardingStep1 = {
  name: '',
  team: '',
  team_name: '',
  default_lens: 'all',
  selected_categories: [],
}

export default function OnboardingPage() {
  const router = useRouter()
  const supabase = createClient()

  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [restoreKey, setRestoreKey] = useState(0)

  const [step1Data, setStep1Data] = useState<OnboardingStep1>(EMPTY_STEP1_DATA)

  const progress = 100

  const handleStep1Submit = async (data: OnboardingStep1) => {
    setStep1Data(data)
    setError(null)
    setLoading(true)

    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('로그인 정보를 찾을 수 없습니다.')

      const profileResult = await completeOnboarding({
        name: data.name,
        team: data.team,
        team_name: data.team_name,
        default_lens: data.default_lens,
      })
      if (profileResult.error) throw new Error(profileResult.error)

      // 관심사(피드 카테고리) 저장 — 홈 카드(FeedCategoryModal)와 동일한 API/컬럼 재사용
      const bootstrapRes = await fetch('/api/preferences/bootstrap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category_keys: data.selected_categories }),
      })
      if (!bootstrapRes.ok) {
        const body = await bootstrapRes.json().catch(() => ({}))
        throw new Error(body.error ?? '관심사 저장에 실패했습니다.')
      }

      // 뉴스레터 구독 기본 등록 (is_active=true, 로그인 이메일)
      const { error: newsletterError } = await supabase
        .from('newsletter_subscriptions')
        .upsert(
          {
            user_id: user.id,
            is_active: true,
            newsletter_email: user.email,
          },
          { onConflict: 'user_id' }
        )
      if (newsletterError) {
        console.error('[onboarding] newsletter upsert error:', JSON.stringify(newsletterError, null, 2))
        // 뉴스레터 실패는 온보딩을 막지 않음 — 경고만
      }

      window.sessionStorage.removeItem(PENDING_SUBMIT_KEY)
      window.sessionStorage.removeItem(RETRY_FLAG_KEY)
      router.push('/dashboard')
      router.refresh()
    } catch (err) {
      if (isUnexpectedResponseError(err) && window.sessionStorage.getItem(RETRY_FLAG_KEY) !== '1') {
        // 배포 직후 등 서버 액션 응답이 깨지는 케이스 — 입력값을 저장해 두고 새로고침 후
        // 자동으로 한 번만 재제출한다. 두 번째도 실패하면 아래 일반 에러 처리로 빠진다.
        window.sessionStorage.setItem(PENDING_SUBMIT_KEY, JSON.stringify(data))
        window.sessionStorage.setItem(RETRY_FLAG_KEY, '1')
        window.location.reload()
        return
      }
      window.sessionStorage.removeItem(RETRY_FLAG_KEY)
      const message = isUnexpectedResponseError(err)
        ? '일시적인 서버 오류가 발생했습니다. 잠시 후 다시 시도해주세요.'
        : err instanceof Error ? err.message : '오류가 발생했습니다.'
      setError(message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    // 새로고침 전에 저장해 둔 입력값이 있으면 복원하고 자동으로 재제출한다.
    // (재시도 플래그가 없으면 저장된 값만 있고 재시도 대상이 아닌 상태이므로 무시)
    const pending = readPendingSubmit()
    const shouldRetry = window.sessionStorage.getItem(RETRY_FLAG_KEY) === '1'
    if (!pending || !shouldRetry) return
    window.sessionStorage.removeItem(PENDING_SUBMIT_KEY)
    // setState 를 effect 본문에서 곧바로 호출하면 react-hooks/set-state-in-effect 에 걸려,
    // 마이크로태스크 경계(async IIFE) 뒤로 미룬다 — 동작은 동일(마운트 직후 1회 복원+재제출).
    void (async () => {
      setStep1Data(pending)
      setRestoreKey((key) => key + 1)
      await handleStep1Submit(pending)
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-lg">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold text-foreground mb-1">
            Insight Out 시작하기
          </h1>
          <p className="text-sm text-muted-foreground">
            1단계 / {STEPS.length}단계 — {STEPS[0]}
          </p>
        </div>

        <Progress value={progress} className="mb-8 h-1.5" />

        <div className="bg-card rounded-2xl shadow-sm border border-border p-8">
          {error && (
            <div className="mb-6 p-3 rounded-lg bg-red-50 border border-red-100 text-sm text-red-600">
              {error}
            </div>
          )}

          <Step1Profile
            key={restoreKey}
            defaultValues={step1Data}
            onNext={handleStep1Submit}
            loading={loading}
          />
        </div>

        <div className="mt-6 flex justify-center gap-2">
          <div className="h-1.5 rounded-full w-6 bg-blue-600" />
        </div>
      </div>
    </div>
  )
}
