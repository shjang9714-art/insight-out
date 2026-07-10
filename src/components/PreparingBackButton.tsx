'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'

const BTN =
  'inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:border-brand-600 hover:text-brand-600'

/** "이전으로 돌아가기" — 브라우저 히스토리로 복귀, 직접 진입 시엔 /dashboard로 폴백. */
export default function PreparingBackButton() {
  const router = useRouter()
  const [hasHistory, setHasHistory] = useState(false)

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 마운트 후 1회 window.history 판정(허용 패턴)
    setHasHistory(window.history.length > 1)
  }, [])

  if (hasHistory) {
    return (
      <button type="button" onClick={() => router.back()} className={BTN}>
        <ArrowLeft className="h-4 w-4" />
        이전으로 돌아가기
      </button>
    )
  }

  return (
    <Link href="/dashboard" className={BTN}>
      <ArrowLeft className="h-4 w-4" />
      이전으로 돌아가기
    </Link>
  )
}
