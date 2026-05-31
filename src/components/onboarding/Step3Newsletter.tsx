'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import type { OnboardingStep3, NewsletterFrequency } from '@/lib/types'

const OPTIONS: { value: NewsletterFrequency; label: string; description: string }[] = [
  {
    value: 'daily',
    label: '매일',
    description: '매일 오전 8시, 주요 인사이트를 받아보세요.',
  },
  {
    value: 'twice_weekly',
    label: '주 2회',
    description: '화·목 오전 8시, 주 2회 핵심 업데이트를 받아보세요.',
  },
  {
    value: 'weekly',
    label: '주 1회',
    description: '매주 월요일 오전 8시, 한 주 요약을 받아보세요.',
  },
  {
    value: 'none',
    label: '구독 안 함',
    description: '뉴스레터를 받지 않습니다.',
  },
]

interface Props {
  defaultEmail: string
  onSubmit: (data: OnboardingStep3) => void
  onBack: () => void
  isSubmitting: boolean
}

export default function Step3Newsletter({ defaultEmail, onSubmit, onBack, isSubmitting }: Props) {
  const [frequency, setFrequency] = useState<NewsletterFrequency>('weekly')
  const [email, setEmail] = useState(defaultEmail)
  const [emailError, setEmailError] = useState<string | null>(null)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    if (frequency !== 'none') {
      if (!email.trim()) {
        setEmailError('수신할 이메일 주소를 입력해주세요.')
        return
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
        setEmailError('올바른 이메일 형식을 입력해주세요.')
        return
      }
    }

    setEmailError(null)
    onSubmit({ frequency, newsletter_email: email.trim() })
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      <p className="text-sm text-gray-600">
        Insight Out 뉴스레터를 얼마나 자주 받아보고 싶으신가요?
      </p>

      <div className="flex flex-col gap-2">
        {OPTIONS.map((option) => {
          const isSelected = frequency === option.value
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => setFrequency(option.value)}
              className={cn(
                'flex flex-col gap-0.5 rounded-xl border p-4 text-left transition-all',
                isSelected
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50'
              )}
            >
              <span className={cn('text-sm font-semibold', isSelected ? 'text-blue-900' : 'text-gray-800')}>
                {option.label}
              </span>
              <span className={cn('text-xs', isSelected ? 'text-blue-700' : 'text-gray-400')}>
                {option.description}
              </span>
            </button>
          )
        })}
      </div>

      {frequency !== 'none' && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="newsletter-email">
            수신 이메일 <span className="text-red-500">*</span>
          </Label>
          <p className="text-xs text-gray-500">Gmail 또는 사내 이메일로 받아보실 수 있습니다.</p>
          <Input
            id="newsletter-email"
            type="email"
            placeholder="예: name@lguplus.co.kr"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value)
              setEmailError(null)
            }}
            aria-invalid={!!emailError}
          />
          {emailError && <p className="text-xs text-red-500">{emailError}</p>}
        </div>
      )}

      <div className="flex gap-3 mt-2">
        <Button
          type="button"
          variant="outline"
          onClick={onBack}
          disabled={isSubmitting}
          className="flex-1 h-10"
        >
          이전
        </Button>
        <Button type="submit" disabled={isSubmitting} className="flex-1 h-10">
          {isSubmitting ? '저장 중...' : '시작하기'}
        </Button>
      </div>
    </form>
  )
}
