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
    team_name: '',
    default_lens: 'all',
    selected_categories: [],
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

      router.push('/dashboard')
      router.refresh()
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
