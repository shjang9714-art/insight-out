'use client'

import { Button } from '@/components/ui/button'

interface ListErrorStateProps {
  message?: string
  onRetry?: () => void
}

export default function ListErrorState({
  message = '목록을 불러오지 못했습니다. 잠시 후 다시 시도해주세요.',
  onRetry,
}: ListErrorStateProps) {
  return (
    <div
      role="alert"
      className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground"
    >
      <p>{message}</p>
      {onRetry && (
        <Button type="button" variant="outline" size="sm" onClick={onRetry}>
          다시 시도
        </Button>
      )}
    </div>
  )
}
