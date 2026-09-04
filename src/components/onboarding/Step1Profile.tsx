'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { DEPARTMENT_DISPLAY_LABEL, ORG_GROUPS, isOrgGroup } from '@/lib/org'
import type { OnboardingStep1 } from '@/lib/types'

interface Props {
  defaultValues: OnboardingStep1
  onNext: (data: OnboardingStep1) => void
  loading?: boolean
}

export default function Step1Profile({ defaultValues, onNext, loading = false }: Props) {
  // default_lens는 복구 호환성을 위해 폼 상태에 유지하고, 최종 값은 Step2 결과로 정한다.
  const [form, setForm] = useState<OnboardingStep1>(defaultValues)
  const [errors, setErrors] = useState<Partial<Record<keyof OnboardingStep1, string>>>({})

  const validate = (): boolean => {
    const next: typeof errors = {}
    if (!form.name.trim()) next.name = '이름을 입력해주세요.'
    if (!isOrgGroup(form.team)) next.team = '그룹을 선택해주세요.'
    if (!form.team_name.trim()) next.team_name = '팀 이름을 입력해주세요.'
    setErrors(next)
    return Object.keys(next).length === 0
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!loading && validate()) onNext(form)
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

      {/* 347: 부문은 Ent 부문 단일 고정, 그룹만 선택 */}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="team">
          그룹 <span className="text-red-500">*</span>
          <span className="ml-2 text-xs font-normal text-muted-foreground">{DEPARTMENT_DISPLAY_LABEL}</span>
        </Label>
        <Select value={isOrgGroup(form.team) ? form.team : undefined} onValueChange={(v) => setForm({ ...form, team: v })}>
          <SelectTrigger id="team" aria-invalid={!!errors.team}>
            <SelectValue placeholder="그룹을 선택하세요" />
          </SelectTrigger>
          <SelectContent>
            {ORG_GROUPS.map((group) => (
              <SelectItem key={group} value={group}>{group}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {errors.team && <p className="text-xs text-red-500">{errors.team}</p>}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="team_name">팀 이름 <span className="text-red-500">*</span></Label>
        <Input
          id="team_name"
          placeholder="예: 클라우드사업팀"
          value={form.team_name}
          onChange={(e) => setForm({ ...form, team_name: e.target.value })}
          aria-invalid={!!errors.team_name}
        />
        {errors.team_name && <p className="text-xs text-red-500">{errors.team_name}</p>}
      </div>

      <Button type="submit" className="mt-2 w-full h-10" disabled={loading}>
        {loading ? '저장 중...' : '다음'}
      </Button>
    </form>
  )
}
