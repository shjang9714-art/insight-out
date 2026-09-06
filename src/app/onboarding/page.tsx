'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Progress } from '@/components/ui/progress'
import Step1Profile from '@/components/onboarding/Step1Profile'
import Step2Interests from '@/components/onboarding/Step2Interests'
import { completeOnboarding } from '@/app/onboarding/actions'
import type { OnboardingStep1 } from '@/lib/types'
import { cn } from '@/lib/utils'

const STEPS = ['프로필 등록', '관심사 선택']

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
  const [currentStep, setCurrentStep] = useState(0)

  const [step1Data, setStep1Data] = useState<OnboardingStep1>(EMPTY_STEP1_DATA)

  const progress = ((currentStep + 1) / STEPS.length) * 100

  const handleStep1Submit = (data: OnboardingStep1) => {
    setStep1Data(data)
    setError(null)
    setCurrentStep(1)
  }

  const handleComplete = async (topicIds: string[]) => {
    setError(null)
    setLoading(true)

    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('로그인 정보를 찾을 수 없습니다.')

      if (topicIds.length > 0) {
        const { error: interestError } = await supabase
          .from('user_interests')
          .insert(topicIds.map(groupId => ({
            user_id: user.id,
            kind: 'topic',
            group_id: groupId,
            weight: 1,
          })))
        if (interestError && interestError.code !== '23505') {
          // 관심사 저장 실패로 가입 완료가 막히지 않게 경고만 남긴다.
          console.warn('[onboarding] 관심사 저장 실패:', interestError.message)
        }
      }

      const profileResult = await completeOnboarding({
        name: step1Data.name,
        team: step1Data.team,
        team_name: step1Data.team_name,
        default_lens: 'all',
      })
      if (profileResult.error) throw new Error(profileResult.error)

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
        window.sessionStorage.setItem(PENDING_SUBMIT_KEY, JSON.stringify(step1Data))
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
      handleStep1Submit(pending)
    })()
  }, [])

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-lg">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold text-foreground mb-1">
            Insight Out 시작하기
          </h1>
          <p className="text-sm text-muted-foreground">
            {currentStep + 1}단계 / {STEPS.length}단계 — {STEPS[currentStep]}
          </p>
        </div>

        <Progress value={progress} className="mb-8 h-1.5" />

        <div className="bg-card rounded-2xl shadow-sm border border-border p-8">
          {error && (
            <div className="mb-6 p-3 rounded-lg bg-red-50 border border-red-100 text-sm text-red-600">
              {error}
            </div>
          )}

          {currentStep === 0 ? (
            <Step1Profile
              key={restoreKey}
              defaultValues={step1Data}
              onNext={handleStep1Submit}
              loading={loading}
            />
          ) : (
            <Step2Interests
              loading={loading}
              onBack={() => {
                setError(null)
                setCurrentStep(0)
              }}
              onComplete={handleComplete}
            />
          )}
        </div>

        <div className="mt-6 flex justify-center gap-2">
          {STEPS.map((step, index) => (
            <div
              key={step}
              className={cn(
                'h-1.5 rounded-full transition-all',
                index === currentStep ? 'w-6 bg-brand-600' : 'w-1.5 bg-muted',
              )}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
