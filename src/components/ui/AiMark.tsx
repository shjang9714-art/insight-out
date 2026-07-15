import { Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'

const SIZE_CLASS = {
  sm: 'h-3 w-3',
  md: 'h-3.5 w-3.5',
} as const

interface AiMarkProps {
  size?: keyof typeof SIZE_CLASS
  title?: string
  className?: string
}

/**
 * 지시서 358 — AI 생성/분석 산출물에만 붙이는 작은 심볼(Sparkles).
 * 남발 금지: 단순 수집 콘텐츠(뉴스·유튜브·외부리포트 등)엔 붙이지 않는다.
 */
export default function AiMark({ size = 'md', title = 'AI 생성', className }: AiMarkProps) {
  return (
    <Sparkles
      aria-label={title}
      role="img"
      className={cn('inline-flex shrink-0 align-middle text-brand-600', SIZE_CLASS[size], className)}
    />
  )
}
