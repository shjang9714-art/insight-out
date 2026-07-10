'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { FEED_CATEGORIES, hashtagsForCategories } from '@/lib/feed/categories'

interface FeedCategoryModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** 편집 진입 시 기존 선택 프리필용 */
  initialCategoryKeys?: string[]
  /** 저장 성공 후 콜백 (없으면 router.refresh) */
  onSaved?: () => void
}

/**
 * 관심 카테고리 다중 선택 팝업.
 * 사용자는 카테고리만 고르고, 선택한 카테고리에 속한 해시태그 전체가
 * 미리보기(읽기 전용 칩)로 노출된다. 저장 시 카테고리 키를 서버에 보낸다.
 */
export default function FeedCategoryModal({
  open,
  onOpenChange,
  initialCategoryKeys = [],
  onSaved,
}: FeedCategoryModalProps) {
  const router = useRouter()
  const [selected, setSelected] = useState<string[]>(initialCategoryKeys)
  const [isSaving, setIsSaving] = useState(false)

  // 열릴 때마다 기존 선택으로 초기화(모달 open 전환 시점 1회 동기화 — 허용 패턴)
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- open 토글 시 프리필 동기화
    if (open) setSelected(initialCategoryKeys)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- open 전환 시점에만 프리필
  }, [open])

  const hashtags = useMemo(() => hashtagsForCategories(selected), [selected])

  function toggleCategory(key: string) {
    setSelected((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    )
  }

  async function handleSave() {
    if (selected.length < 1) {
      toast.error('카테고리를 최소 1개 선택해주세요.')
      return
    }
    setIsSaving(true)
    try {
      const res = await fetch('/api/preferences/bootstrap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category_keys: selected }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? '저장에 실패했습니다.')
      }
      toast.success('관심 카테고리가 저장되었습니다.')
      onOpenChange(false)
      if (onSaved) {
        onSaved()
      } else {
        router.refresh()
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '저장에 실패했습니다.')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>관심 카테고리를 선택하세요</DialogTitle>
          <DialogDescription>
            선택한 카테고리의 해시태그를 기준으로 맞춤 콘텐츠를 추천해 드려요.
          </DialogDescription>
        </DialogHeader>

        {/* 카테고리 다중 선택 */}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {FEED_CATEGORIES.map((category) => {
            const active = selected.includes(category.key)
            return (
              <button
                key={category.key}
                type="button"
                onClick={() => toggleCategory(category.key)}
                aria-pressed={active}
                className={
                  'rounded-xl border px-3 py-2.5 text-sm font-medium transition-colors ' +
                  (active
                    ? 'border-brand-600 bg-brand-50 text-brand-700'
                    : 'border-border bg-card text-foreground hover:border-brand-300')
                }
              >
                {category.label}
              </button>
            )
          })}
        </div>

        {/* 선택 카테고리의 해시태그 미리보기 (읽기 전용) */}
        {hashtags.length > 0 && (
          <div className="mt-4 rounded-xl border border-dashed border-border p-3">
            <p className="mb-2 text-xs font-medium text-muted-foreground">
              포함 해시태그 ({hashtags.length})
            </p>
            <div className="flex flex-wrap gap-1.5">
              {hashtags.map((tag) => (
                <span
                  key={tag}
                  className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground"
                >
                  #{tag}
                </span>
              ))}
            </div>
          </div>
        )}

        <DialogFooter>
          <span className="mr-auto self-center text-xs text-muted-foreground">
            선택: {selected.length} / {FEED_CATEGORIES.length}
          </span>
          <Button
            type="button"
            size="sm"
            disabled={selected.length < 1 || isSaving}
            onClick={handleSave}
          >
            저장
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
