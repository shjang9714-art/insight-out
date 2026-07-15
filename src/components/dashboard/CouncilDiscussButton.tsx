import Link from 'next/link'
import { MessagesSquare } from 'lucide-react'
import { cn } from '@/lib/utils'

// 362 — 콘텐츠·엔티티 상세에서 COUNCIL(AI 협의체)로 현재 맥락을 밀어넣는 진입점.
// 제목·요약·참조(ref/refId)만 쿼리로 전달한다(원문·민감정보 노출 금지).
const CONTEXT_MAX_LEN = 500

interface CouncilDiscussButtonProps {
  title: string
  summary?: string | null
  refType: 'contents' | 'entities'
  refId: string
  className?: string
}

export default function CouncilDiscussButton({
  title,
  summary,
  refType,
  refId,
  className,
}: CouncilDiscussButtonProps) {
  const params = new URLSearchParams({ topic: title, ref: refType, refId })
  const context = summary?.trim().slice(0, CONTEXT_MAX_LEN)
  if (context) params.set('context', context)

  return (
    <Link
      href={`/dashboard/council?${params.toString()}`}
      prefetch={false}
      className={cn(
        'flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:border-brand-600 hover:text-brand-600',
        className,
      )}
    >
      <MessagesSquare className="h-4 w-4" />
      이 주제로 토론
    </Link>
  )
}
