'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { OnboardingStep1 } from '@/lib/types'

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
        <Label htmlFor="position">직책 <span className="text-gray-400 font-normal text-xs">(선택)</span></Label>
        <Input
          id="position"
          placeholder="예: 팀장, 매니저"
          value={form.position}
          onChange={(e) => setForm({ ...form, position: e.target.value })}
        />
      </div>

      <Button type="submit" className="mt-2 w-full h-10">
        다음
      </Button>
    </form>
  )
}
