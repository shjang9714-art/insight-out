'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Progress } from '@/components/ui/progress'
import Step1Profile from '@/components/onboarding/Step1Profile'
import { completeOnboarding } from '@/app/onboarding/actions'
import type { OnboardingStep1 } from '@/lib/types'

const STEPS = ['프로필 등록']

export default function OnboardingPage() {
  const router = useRouter()
  const supabase = createClient()

  const [error, setError] = useState<string | null>(null)

  const [step1Data, setStep1Data] = useState<OnboardingStep1>({
    name: '',
    team: '',
    default_lens: 'all',
    selected_services: [],
  })

  useEffect(() => {
    // 로그인 이메일 확보 불필요 — 뉴스레터 단계 제거로 authEmail 미사용
  }, [])

  const progress = 100

  const handleStep1Submit = async (data: OnboardingStep1) => {
    setStep1Data(data)
    setError(null)

    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('로그인 정보를 찾을 수 없습니다.')

      const profileResult = await completeOnboarding({
        name: data.name,
        team: data.team,
        default_lens: data.default_lens,
      })
      if (profileResult.error) throw new Error(profileResult.error)

      if (data.selected_services.length > 0) {
        const { data: matchedServices, error: servicesError } = await supabase
          .from('services')
          .select('id, name')
          .in('name', data.selected_services)
        if (servicesError) {
          console.error('[onboarding] services 조회 오류:', servicesError)
          throw new Error('담당 서비스 정보를 불러오는 데 실패했습니다.')
        }

        if (matchedServices && matchedServices.length > 0) {
          const userServiceRows = matchedServices.map((s) => ({
            user_id: user.id,
            service_id: s.id,
            is_pinned: false,
          }))
          const { error: userServicesError } = await supabase
            .from('user_services')
            .upsert(userServiceRows, { onConflict: 'user_id,service_id' })
          if (userServicesError) {
            console.error('[onboarding] user_services upsert 오류:', userServicesError)
            throw new Error('담당 서비스 저장에 실패했습니다.')
          }
        }
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

      router.refresh()
      router.push('/dashboard')
    } catch (err) {
      const message = err instanceof Error ? err.message : '오류가 발생했습니다.'
      setError(message)
    }
  }

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
            defaultValues={step1Data}
            onNext={handleStep1Submit}
          />
        </div>

        <div className="mt-6 flex justify-center gap-2">
          <div className="h-1.5 rounded-full w-6 bg-blue-600" />
        </div>
      </div>
    </div>
  )
}
