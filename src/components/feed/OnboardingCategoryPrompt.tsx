'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import FeedCategoryModal from './FeedCategoryModal'

/**
 * 신규 사용자용 온보딩 카드 — 관심 카테고리 선택 팝업을 여는 진입점.
 * 카테고리를 고르면 맞춤 추천 피드가 만들어지고, 건너뛰면 트렌딩 폴백으로 전환된다.
 */
export default function OnboardingCategoryPrompt() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [isSkipping, setIsSkipping] = useState(false)

  async function handleSkip() {
    setIsSkipping(true)
    try {
      const res = await fetch('/api/preferences/skip', { method: 'POST' })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? '건너뛰기에 실패했습니다.')
      }
      router.refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '건너뛰기에 실패했습니다.')
    } finally {
      setIsSkipping(false)
    }
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <h2 className="mb-1 text-sm font-semibold text-foreground">
        🎯 관심 카테고리를 골라 맞춤 피드를 만들어요
      </h2>
      <p className="mb-4 text-xs text-muted-foreground">
        통신·보안·AI 등 11개 분야 중 관심 있는 분야를 선택하면 관련 콘텐츠를 모아 보여드려요.
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" onClick={() => setOpen(true)}>
          관심 카테고리 선택하기
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={isSkipping}
          onClick={handleSkip}
        >
          건너뛰기
        </Button>
      </div>

      <FeedCategoryModal open={open} onOpenChange={setOpen} initialCategoryKeys={[]} />
    </div>
  )
}
