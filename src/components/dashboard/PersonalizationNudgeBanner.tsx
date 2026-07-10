'use client'
import { useState } from 'react'
import Link from 'next/link'
import { Sparkles, X } from 'lucide-react'

const DISMISS_KEY = 'io:personalize-nudge-dismissed'

export default function PersonalizationNudgeBanner({
  noCategories,
  noWatchlist,
}: {
  noCategories: boolean
  noWatchlist: boolean
}) {
  const [dismissed, setDismissed] = useState(() => {
    if (typeof window === 'undefined') return false
    try { return localStorage.getItem(DISMISS_KEY) === '1' } catch { return false }
  })
  if (dismissed) return null

  const missing =
    noCategories && noWatchlist ? '관심 카테고리와 관심 기업'
    : noCategories ? '관심 카테고리'
    : '관심 기업'

  const handleDismiss = () => {
    try { localStorage.setItem(DISMISS_KEY, '1') } catch { /* noop */ }
    setDismissed(true)
  }

  return (
    <div className="flex items-center gap-3 rounded-xl border border-brand-600/30 bg-brand-600/5 px-4 py-3">
      <Sparkles className="h-4 w-4 shrink-0 text-brand-600" />
      <p className="flex-1 text-sm text-foreground">
        {missing}을 설정하면 당신에게 맞는 이슈·기업·인사이트를 모아 보여드려요.{' '}
        <Link href="/dashboard/mypage" className="font-medium text-brand-600 hover:underline">
          설정하기 →
        </Link>
      </p>
      <button
        type="button"
        onClick={handleDismiss}
        aria-label="닫기"
        className="shrink-0 rounded p-1 text-muted-foreground hover:text-foreground transition-colors"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}
