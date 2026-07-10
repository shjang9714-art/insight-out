'use client'

import { useEffect } from 'react'
import ContentPreparing from '@/components/ContentPreparing'

/** 대시보드 밖 세그먼트에서 렌더 예외 발생 시 기본 오류 화면 대신 준비중 화면 + 재시도. */
export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <ContentPreparing
      variant="error"
      action={
        <button
          onClick={reset}
          className="inline-flex items-center rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-700"
        >
          다시 시도
        </button>
      }
    />
  )
}
