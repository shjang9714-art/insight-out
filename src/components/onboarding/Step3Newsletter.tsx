'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import type { OnboardingStep3, NewsletterFrequency } from '@/lib/types'

const OPTIONS: { value: NewsletterFrequency; label: string; description: string }[] = [
  {
    value: 'daily',
    label: '매일',
    description: '매일 아침 주요 인사이트를 받아보세요.',
  },
  {
    value: 'weekly',
    label: '매주',
    description: '매주 월요일 한 주 요약을 받아보세요.',
  },
  {
    value: 'none',
    label: '구독 안 함',
    description: '뉴스레터를 받지 않습니다.',
  },
]

interface Props {
  onSubmit: (data: OnboardingStep3) => void
  onBack: () => void
  isSubmitting: boolean
}

export default function Step3Newsletter({ onSubmit, onBack, isSubmitting }: Props) {
  const [frequency, setFrequency] = useState<NewsletterFrequency>('weekly')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onSubmit({ frequency })
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
              className={`flex flex-col gap-0.5 rounded-xl border p-4 text-left transition-all ${
                isSelected
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50'
              }`}
            >
              <span className={`text-sm font-semibold ${isSelected ? 'text-blue-900' : 'text-gray-800'}`}>
                {option.label}
              </span>
              <span className={`text-xs ${isSelected ? 'text-blue-700' : 'text-gray-400'}`}>
                {option.description}
              </span>
            </button>
          )
        })}
      </div>

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
