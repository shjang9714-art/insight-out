'use client'

import LensSwitcher from '@/components/lens/LensSwitcher'
import { useActiveLens, useSelectedInterests, useLensContext, LENS_PRESETS } from '@/lib/lens'

function buildStatusText(activeLensLabel: string, selectedNames: string[]): string {
  if (selectedNames.length === 0) return activeLensLabel
  if (selectedNames.length <= 3) return `${activeLensLabel} · ${selectedNames.join(', ')}`
  return `${activeLensLabel} · ${selectedNames.slice(0, 2).join(', ')} 외 ${selectedNames.length - 2}`
}

export default function LensStatusBar() {
  const ctx = useLensContext()
  const [activeLens] = useActiveLens()
  const [selectedKeys] = useSelectedInterests()

  if (ctx.count === 0) return null

  const selectedNames = activeLens === 'all'
    ? []
    : ctx.items
      .filter(item => selectedKeys.includes(item.key))
      .map(item => item.name)

  const statusText = buildStatusText(LENS_PRESETS[activeLens].label, selectedNames)

  return (
    <div className="sticky top-14 z-20 border-b border-border bg-background px-4 py-2 sm:px-6 lg:px-8 print:hidden">
      <div className="flex items-center justify-between gap-3">
        <p className="min-w-0 truncate text-xs text-muted-foreground">{statusText}</p>
        <div className="shrink-0">
          <LensSwitcher />
        </div>
      </div>
    </div>
  )
}
