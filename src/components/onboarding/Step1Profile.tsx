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
import { cn } from '@/lib/utils'
import type { OnboardingStep1 } from '@/lib/types'
import { LENS_PRESETS, type LensKey } from '@/lib/lens'
import ServiceSelectionGrid from '@/components/mypage/ServiceSelectionGrid'
import { FEED_CATEGORIES } from '@/lib/feed/categories'

const FILTER_OPTIONS: { value: LensKey; label: string; description: string }[] = (
  ['watch', 'all'] as const
).map((key) => ({ value: key, label: LENS_PRESETS[key].label, description: LENS_PRESETS[key].desc }))

interface Props {
  defaultValues: OnboardingStep1
  onNext: (data: OnboardingStep1) => void
  loading?: boolean
}

export default function Step1Profile({ defaultValues, onNext, loading = false }: Props) {
  const [form, setForm] = useState<OnboardingStep1>(defaultValues)
  const [errors, setErrors] = useState<Partial<Record<keyof OnboardingStep1, string>>>({})

  const validate = (): boolean => {
    const next: typeof errors = {}
    if (!form.name.trim()) next.name = '이름을 입력해주세요.'
    if (!isOrgGroup(form.team)) next.team = '그룹을 선택해주세요.'
    if (!form.team_name.trim()) next.team_name = '팀 이름을 입력해주세요.'
    if (form.selected_categories.length < 1) next.selected_categories = '관심사를 1개 이상 선택해주세요.'
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

        {/* 관심사(맞춤 추천 피드 카테고리) — 홈 카드(FeedCategoryModal)와 동일한 FEED_CATEGORIES 소스 */}
        <div className="flex flex-col gap-2 mt-1">
          <Label>관심사 <span className="text-red-500">*</span></Label>
          <p className="text-xs text-muted-foreground">
            관심 있는 분야를 선택하면 홈 화면 맞춤 추천 피드를 채워드려요. 여러 개 선택 가능합니다.
          </p>
          <ServiceSelectionGrid
            items={FEED_CATEGORIES.map((category) => ({ id: category.key, name: category.label }))}
            selectedIds={form.selected_categories}
            onChange={(selected_categories) => setForm({ ...form, selected_categories })}
            compact
          />
          {errors.selected_categories && <p className="text-xs text-red-500">{errors.selected_categories}</p>}
          <p className="text-xs text-muted-foreground">
            관심사는 마이페이지/홈에서 언제든지 수정할 수 있어요.
          </p>
        </div>
      </div>

      <Button type="submit" className="mt-2 w-full h-10" disabled={loading}>
        {loading ? '저장 중...' : '다음'}
      </Button>
    </form>
  )
}
