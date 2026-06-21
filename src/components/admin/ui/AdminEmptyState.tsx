import { cn } from '@/lib/utils'
import type { LucideIcon } from 'lucide-react'

interface Props {
  message: string
  hint?: string
  icon?: LucideIcon
  className?: string
}

export default function AdminEmptyState({ message, hint, icon: Icon, className }: Props) {
  return (
    <div className={cn('rounded-xl border border-dashed p-8 text-center', className)}>
      {Icon && <Icon className="mx-auto mb-2 h-6 w-6 text-muted-foreground/50" />}
      <p className="text-sm text-muted-foreground">{message}</p>
      {hint && <p className="mt-1 text-xs text-muted-foreground/70">{hint}</p>}
    </div>
  )
}
