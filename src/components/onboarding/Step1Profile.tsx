'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import type { OnboardingStep1 } from '@/lib/types'
import { LENS_PRESETS, type LensKey } from '@/lib/lens'

const FILTER_OPTIONS: { value: LensKey; label: string; description: string }[] = (
  ['mine', 'watch', 'all'] as const
).map((key) => ({ value: key, label: LENS_PRESETS[key].label, description: LENS_PRESETS[key].desc }))

const SERVICE_OPTIONS = [
  'Connectivity',
  '보안/클라우드',
  'M2M',
  'AICC',
  'AIDC',
  '모빌리티',
  '기업솔루션',
]

interface Props {
  defaultValues: OnboardingStep1
  onNext: (data: OnboardingStep1) => void
}

export default function Step1Profile({ defaultValues, onNext }: Props) {
  const [form, setForm] = useState<OnboardingStep1>(defaultValues)
  const [errors, setErrors] = useState<Partial<Record<keyof OnboardingStep1, string>>>({})

  const validate = (): boolean => {
    const next: typeof errors = {}
    if (!form.name.trim()) next.name = '이름을 입력해주세요.'
    if (!form.team.trim()) next.team = '팀명을 입력해주세요.'
    setErrors(next)
    return Object.keys(next).length === 0
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (validate()) onNext(form)
  }

  const toggleService = (service: string) => {
    setForm((prev) => {
      const next = prev.selected_services.includes(service)
        ? prev.selected_services.filter((s) => s !== service)
        : [...prev.selected_services, service]
      return { ...prev, selected_services: next }
    })
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="name">이름 <span className="text-red-500">*</span></Label>
        <Input
          id="name"
          placeholder="홍길동"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          aria-invalid={!!errors.name}
        />
        {errors.name && <p className="text-xs text-red-500">{errors.name}</p>}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="team">팀 <span className="text-red-500">*</span></Label>
        <Input
          id="team"
          placeholder="예: 솔루션영업1팀"
          value={form.team}
          onChange={(e) => setForm({ ...form, team: e.target.value })}
          aria-invalid={!!errors.team}
        />
        {errors.team && <p className="text-xs text-red-500">{errors.team}</p>}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="position">직책 <span className="text-muted-foreground font-normal text-xs">(선택)</span></Label>
        <Input
          id="position"
          placeholder="예: 팀장, 매니저"
          value={form.position}
          onChange={(e) => setForm({ ...form, position: e.target.value })}
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label>콘텐츠 보기 방식 <span className="text-red-500">*</span></Label>
        <p className="text-xs text-muted-foreground">대시보드에서 어떤 범위의 콘텐츠를 기본으로 보시겠어요?</p>
        <div className="flex gap-2">
          {FILTER_OPTIONS.map((opt) => {
            const isSelected = form.default_lens === opt.value
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => setForm({ ...form, default_lens: opt.value })}
                className={cn(
                  'flex flex-1 flex-col gap-0.5 rounded-xl border p-3 text-left transition-all',
                  isSelected
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-border bg-card hover:border-border hover:bg-accent'
                )}
              >
                <span className={cn('text-sm font-semibold', isSelected ? 'text-blue-900' : 'text-foreground')}>
                  {opt.label}
                </span>
                <span className={cn('text-xs leading-snug', isSelected ? 'text-blue-700' : 'text-muted-foreground')}>
                  {opt.description}
                </span>
              </button>
            )
          })}
        </div>

        {/* 담당 서비스는 항상 노출 — watch/all을 골라도 담당 서비스는 받는다(309) */}
        <div className="flex flex-col gap-2 mt-1">
          <p className="text-xs text-muted-foreground">담당 서비스를 선택해주세요. 여러 개 선택 가능합니다.</p>
          <div className="flex flex-wrap gap-2">
            {SERVICE_OPTIONS.map((service) => {
              const isSelected = form.selected_services.includes(service)
              return (
                <button
                  key={service}
                  type="button"
                  onClick={() => toggleService(service)}
                  className={cn(
                    'rounded-lg border px-3 py-1.5 text-sm font-medium transition-all',
                    isSelected
                      ? 'border-blue-500 bg-blue-50 text-blue-900'
                      : 'border-border bg-card text-foreground hover:border-border hover:bg-accent'
                  )}
                >
                  {service}
                </button>
              )
            })}
          </div>
          <p className="text-xs text-muted-foreground">
            가입 이후 프로필에서 담당 서비스를 변경할 수 있습니다.
          </p>
        </div>
      </div>

      <Button type="submit" className="mt-2 w-full h-10">
        다음
      </Button>
    </form>
  )
}
