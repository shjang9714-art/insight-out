import { cn } from '@/lib/utils'

export type LguImpactValue = '위기' | '기회' | '관망' | null

interface Props {
  impact: string | null | undefined
  /** 건수(경쟁사 화면의 그룹·기업 카드용). 없으면 콘텐츠 화면의 단건 배지로 동작 */
  count?: number
  /** count 없이도 '관망'을 보여줘야 하는 화면(경쟁사 주간 리포트의 종합 판정 등)에서만 true */
  showNeutral?: boolean
  size?: 'sm' | 'md'
  className?: string
}

const IMPACT_STYLE: Record<'위기' | '기회' | '관망', string> = {
  위기: 'border-negative/20 bg-negative-soft text-negative',
  기회: 'border-positive/20 bg-positive-soft text-positive',
  관망: 'border-border bg-muted text-muted-foreground',
}

const IMPACT_EMOJI: Record<'위기' | '기회', string> = { 위기: '🔴', 기회: '🟢' }

const SIZE_STYLE: Record<'sm' | 'md', string> = {
  sm: 'px-2 py-0.5 text-[11px]',
  md: 'px-2.5 py-1 text-xs',
}

/**
 * LG U+ 관점 위기/기회 배지 — 앱 전체에서 이 정의 하나만 쓴다(313).
 * `count` 없이 쓰면 콘텐츠 상세·카드의 단건 배지: '관망'·null 은 아무것도 렌더하지 않는다
 * (대부분이 관망이라 배지가 흔해지면 신호를 잃는다).
 * `count` 를 주면 경쟁사 화면의 건수 배지("위기 3")로 동작하며, 0건이면 렌더하지 않는다.
 * `showNeutral` 을 주면 count 없이도 '관망'을 보여준다(경쟁사 주간 리포트의 종합 판정처럼
 * '관망' 자체가 유의미한 결과 값인 화면 전용 — 남발 금지).
 */
export default function LguImpactBadge({ impact, count, showNeutral, size = 'sm', className }: Props) {
  if (impact !== '위기' && impact !== '기회' && impact !== '관망') return null
  if (impact === '관망' && count === undefined && !showNeutral) return null
  if (count !== undefined && count <= 0) return null

  const label = count !== undefined ? `${impact} ${count}` : impact
  const emoji = count === undefined && impact !== '관망' ? IMPACT_EMOJI[impact] : null

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border font-semibold',
        SIZE_STYLE[size],
        IMPACT_STYLE[impact],
        className
      )}
    >
      {emoji}
      {label}
    </span>
  )
}
