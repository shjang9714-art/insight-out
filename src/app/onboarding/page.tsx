'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Progress } from '@/components/ui/progress'
import Step1Profile from '@/components/onboarding/Step1Profile'
import Step3Newsletter from '@/components/onboarding/Step3Newsletter'
import type {
  OnboardingStep1,
  OnboardingStep3,
  NewsletterFrequency,
} from '@/lib/types'

const STEPS = ['프로필 등록', '뉴스레터']

export default function OnboardingPage() {
  const router = useRouter()
  const supabase = createClient()

  const [currentStep, setCurrentStep] = useState(1)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [authEmail, setAuthEmail] = useState('')

  const [step1Data, setStep1Data] = useState<OnboardingStep1>({
    name: '',
    department: '기타',
    team: '',
    position: '',
    content_filter_mode: 'all',
  })

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user?.email) setAuthEmail(user.email)
    })
  }, [])

  const progress = (currentStep / STEPS.length) * 100

  const handleStep1Next = (data: OnboardingStep1) => {
    setStep1Data(data)
    setCurrentStep(2)
  }

  const handleStep2Submit = async (data: OnboardingStep3) => {
    setIsSubmitting(true)
    setError(null)

    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('로그인 정보를 찾을 수 없습니다.')

      const upsertPayload = {
        id: user.id,
        email: user.email!,
        name: step1Data.name,
        department: step1Data.department,
        team: step1Data.team,
        position: step1Data.position || null,
        content_filter_mode: step1Data.content_filter_mode,
        onboarding_completed: true,
      }
      console.log('[onboarding] users upsert payload:', upsertPayload)

      const { error: profileError } = await supabase
        .from('users')
        .upsert(upsertPayload, { onConflict: 'id' })
      if (profileError) {
        console.error('[onboarding] users upsert error:', JSON.stringify(profileError, null, 2))
        throw new Error(
          `프로필 저장 실패: ${profileError.message}` +
          (profileError.code ? ` (code: ${profileError.code})` : '') +
          (profileError.hint ? ` — ${profileError.hint}` : '')
        )
      }

      const isActive = data.frequency !== 'none'
      const newsletterPayload = {
        user_id: user.id,
        frequency: data.frequency as NewsletterFrequency,
        is_active: isActive,
        newsletter_email: isActive ? data.newsletter_email : null,
      }
      console.log('[onboarding] newsletter upsert payload:', newsletterPayload)

      const { error: newsletterError } = await supabase
        .from('newsletter_subscriptions')
        .upsert(newsletterPayload, { onConflict: 'user_id' })
      if (newsletterError) {
        console.error('[onboarding] newsletter upsert error:', JSON.stringify(newsletterError, null, 2))
        throw new Error(
          `뉴스레터 설정 실패: ${newsletterError.message}` +
          (newsletterError.code ? ` (code: ${newsletterError.code})` : '') +
          (newsletterError.hint ? ` — ${newsletterError.hint}` : '')
        )
      }

      router.refresh()
      router.push('/dashboard')
    } catch (err) {
      const message = err instanceof Error ? err.message : '오류가 발생했습니다.'
      setError(message)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-lg">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-1">
            Insight Out 시작하기
          </h1>
          <p className="text-sm text-gray-500">
            {currentStep}단계 / {STEPS.length}단계 — {STEPS[currentStep - 1]}
          </p>
        </div>

        <Progress value={progress} className="mb-8 h-1.5" />

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
          {error && (
            <div className="mb-6 p-3 rounded-lg bg-red-50 border border-red-100 text-sm text-red-600">
              {error}
            </div>
          )}

          {currentStep === 1 && (
            <Step1Profile
              defaultValues={step1Data}
              onNext={handleStep1Next}
            />
          )}
          {currentStep === 2 && (
            <Step3Newsletter
              defaultEmail={authEmail}
              onSubmit={handleStep2Submit}
              onBack={() => setCurrentStep(1)}
              isSubmitting={isSubmitting}
            />
          )}
        </div>

        <div className="mt-6 flex justify-center gap-2">
          {STEPS.map((_, i) => (
            <div
              key={i}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                i + 1 <= currentStep
                  ? 'w-6 bg-blue-600'
                  : 'w-1.5 bg-gray-200'
              }`}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
