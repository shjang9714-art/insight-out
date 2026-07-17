import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export interface AdminContextItem {
  label: string
  value: ReactNode
}

/** 화면 상단 상태 요약 바. AI 콘텐츠 화면에서 유형·환경·상태·프롬프트 버전·주 모델 등을 표시(§16). 항목 없으면 렌더 안 함. */
export default function AdminContextBar({ items, className }: { items: AdminContextItem[]; className?: string }) {
  if (items.length === 0) return null
  return (
    <div className={cn('mb-5 flex flex-wrap items-center gap-x-5 gap-y-2 rounded-lg border border-border bg-muted/40 px-4 py-2.5', className)}>
      {items.map((it, i) => (
        <div key={i} className="flex items-center gap-1.5">
          <span className="admin-caption text-muted-foreground">{it.label}</span>
          <span className="admin-caption font-medium text-foreground">{it.value}</span>
        </div>
      ))}
    </div>
  )
}
