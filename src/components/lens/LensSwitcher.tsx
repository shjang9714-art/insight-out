'use client'

import Link from 'next/link'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  useLensContext,
  useActiveLens,
  LENS_PRESETS,
  type LensKey,
} from '@/lib/lens'

export default function LensSwitcher() {
  const ctx = useLensContext()
  const [activeLens, setActiveLens] = useActiveLens()

  const hasWatch = ctx.count > 0

  const chips: { key: LensKey; disabled: boolean }[] = [
    { key: 'watch', disabled: !hasWatch },
    { key: 'all',   disabled: false     },
  ]

  const showWatchHint = !hasWatch

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className="shrink-0 text-[11px] text-muted-foreground/70 mr-0.5">보기</span>
        {chips.map(({ key, disabled }) => {
          const active = activeLens === key
          return (
            <button
              key={key}
              type="button"
              disabled={disabled}
              onClick={() => { if (!disabled) setActiveLens(key) }}
              className={cn(
                'inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                active && !disabled
                  ? 'border-brand-600 bg-brand-600/10 text-brand-600'
                  : disabled
                  ? 'border-border text-muted-foreground/40 cursor-not-allowed'
                  : 'border-border text-muted-foreground hover:text-foreground hover:border-foreground/60'
              )}
            >
              {LENS_PRESETS[key].label}
            </button>
          )
        })}

        {/* 빠른 해제 — 전체로 ✕ */}
        {activeLens !== 'all' && (
          <button
            type="button"
            onClick={() => setActiveLens('all')}
            className="inline-flex items-center gap-0.5 rounded-full border border-brand-600/40 bg-brand-600/5 px-2.5 py-1 text-xs font-medium text-brand-600 hover:bg-brand-600/10 transition-colors"
          >
            전체로
            <X className="h-3 w-3" />
          </button>
        )}
      </div>

      {/* 미설정 안내 */}
      {showWatchHint && (
        <p className="text-[11px] text-muted-foreground">
          관심 기업을 등록하면 해당 소식만 모아볼 수 있어요.{' '}
          <Link href="/dashboard/mypage" className="text-brand-600 hover:underline">
            마이페이지 →
          </Link>
        </p>
      )}
    </div>
  )
}
