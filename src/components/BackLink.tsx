'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'

interface BackLinkProps {
  className?: string
  /** 브라우저 히스토리가 없을 때(새 탭 직접 진입 등) 갈 곳 — 목록 등 안전한 기본 경로 */
  fallbackHref?: string
}

/**
 * "이전으로" — 홈/트렌딩/검색 등 어디서 왔든 실제 브라우저 히스토리로 되돌아간다.
 * 직접 진입(히스토리 없음) 시에만 fallbackHref로 대체(죽은 버튼 방지).
 */
export default function BackLink({ className, fallbackHref = '/dashboard/contents' }: BackLinkProps) {
  const router = useRouter()
  const [hasHistory, setHasHistory] = useState(false)

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 마운트 후 1회 window.history 판정(허용 패턴)
    setHasHistory(window.history.length > 1)
  }, [])

  if (hasHistory) {
    return (
      <button type="button" onClick={() => router.back()} className={className}>
        <ArrowLeft className="h-4 w-4" />
        이전으로
      </button>
    )
  }

  return (
    <Link href={fallbackHref} className={className}>
      <ArrowLeft className="h-4 w-4" />
      이전으로
    </Link>
  )
}
