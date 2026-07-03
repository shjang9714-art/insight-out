import { cn } from '@/lib/utils'
import { TONE_BADGE_CLS, type Tone } from '@/lib/admin/status-style'

interface Props {
  tone: Tone
  label: string
  className?: string
}

export default function StatusBadge({ tone, label, className }: Props) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
        TONE_BADGE_CLS[tone],
        className
      )}
    >
      {label}
    </span>
  )
}
