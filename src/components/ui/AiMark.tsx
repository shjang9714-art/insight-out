import { Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'

interface AiMarkProps {
  size?: 'sm' | 'md'
  title?: string
}

/** AI가 생성하거나 분석한 결과임을 표시하는 공통 심볼. */
export function AiMark({ size = 'md', title = 'AI 생성' }: AiMarkProps) {
  return (
    <span
      role="img"
      aria-label={title}
      title={title}
      className="inline-flex align-middle text-brand-600"
    >
      <Sparkles
        aria-hidden
        className={cn(size === 'sm' ? 'h-3 w-3' : 'h-3.5 w-3.5')}
      />
    </span>
  )
}
