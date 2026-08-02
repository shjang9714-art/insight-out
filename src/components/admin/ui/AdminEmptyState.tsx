import type { LucideIcon } from 'lucide-react'
import { AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface Props {
  variant?: 'empty' | 'error'
  message: string
  hint?: string
  icon?: LucideIcon
  onRetry?: () => void
  className?: string
}

export default function AdminEmptyState({ variant = 'empty', message, hint, icon, onRetry, className }: Props) {
  const Icon = icon ?? (variant === 'error' ? AlertTriangle : undefined)
  return (
    <div className={cn('rounded-xl border border-dashed p-8 text-center', variant === 'error' && 'border-destructive/50 bg-destructive/5', className)}>
      {Icon && <Icon className={cn('mx-auto mb-2 h-6 w-6 text-muted-foreground/50', variant === 'error' && 'text-destructive')} />}
      <p className={cn('text-sm text-muted-foreground', variant === 'error' && 'font-medium text-destructive')}>{message}</p>
      {hint && <p className="mt-1 text-xs text-muted-foreground/70">{hint}</p>}
      {variant === 'error' && onRetry && <Button type="button" variant="outline" size="sm" className="mt-4" onClick={onRetry}>다시 시도</Button>}
    </div>
  )
}
