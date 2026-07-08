import { cn } from '@/lib/utils'
import type { ReactNode } from 'react'

export default function AdminErrorBox({
  children, onDismiss, className,
}: { children: ReactNode; onDismiss?: () => void; className?: string }) {
  return (
    <div className={cn(
      'flex items-start justify-between gap-4 rounded-lg border border-negative/20 bg-negative-soft px-4 py-3 text-sm text-negative',
      className,
    )}>
      <div className="min-w-0">{children}</div>
      {onDismiss && (
        <button type="button" onClick={onDismiss}
          className="ml-4 shrink-0 text-negative/70 underline hover:text-negative">
          닫기
        </button>
      )}
    </div>
  )
}
