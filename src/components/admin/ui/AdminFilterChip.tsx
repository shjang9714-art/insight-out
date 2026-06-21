import { cn } from '@/lib/utils'

interface Props {
  active: boolean
  onClick: () => void
  children: React.ReactNode
  count?: number
}

export default function AdminFilterChip({ active, onClick, children, count }: Props) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors',
        active
          ? 'border-brand-600 bg-brand-600/10 text-brand-600'
          : 'border-border text-muted-foreground hover:text-foreground'
      )}
    >
      {children}
      {count != null && <span className="tabular-nums">{count}</span>}
    </button>
  )
}
