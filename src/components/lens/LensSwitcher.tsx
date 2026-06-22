'use client'

import Link from 'next/link'
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

  const hasMine  = ctx.serviceIds.length > 0
  const hasWatch = ctx.watchlist.length > 0

  const chips: { key: LensKey; disabled: boolean; hint?: string }[] = [
    {
      key: 'mine',
      disabled: !hasMine,
      hint: hasMine ? undefined : '마이페이지에서 담당 서비스를 설정하세요',
    },
    {
      key: 'watch',
      disabled: !hasWatch,
      hint: hasWatch ? undefined : '마이페이지에서 관심 기업을 등록하세요',
    },
    { key: 'all', disabled: false },
  ]

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <span className="shrink-0 text-[11px] text-muted-foreground/70 mr-0.5">렌즈</span>
      {chips.map(({ key, disabled, hint }) => {
        const active = activeLens === key
        return (
          <div key={key} className="relative group">
            <button
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

            {/* 비활성 툴팁 + 마이페이지 링크 */}
            {disabled && hint && (
              <div className="pointer-events-none absolute left-1/2 top-full z-50 mt-1.5 hidden -translate-x-1/2 whitespace-nowrap rounded-lg border border-border bg-popover px-3 py-2 text-[11px] text-muted-foreground shadow-md group-hover:block">
                <Link
                  href="/dashboard/mypage"
                  className="pointer-events-auto text-brand-600 hover:underline"
                >
                  {hint}
                </Link>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
