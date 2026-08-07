'use client'

import type { ReactNode } from 'react'

interface AdminSelectionBarProps {
  count: number
  children: ReactNode
}

export default function AdminSelectionBar({ count, children }: AdminSelectionBarProps) {
  return (
    <div className="sticky top-0 z-30 flex flex-wrap items-center gap-3 rounded-lg border border-border bg-accent px-4 py-2.5 text-sm shadow-sm">
      <span className="font-medium text-foreground">{count}건 선택</span>
      <div className="flex gap-2">{children}</div>
    </div>
  )
}
