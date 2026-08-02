'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { useIsInsideContentDetailModal } from '@/lib/content-detail/modal-context'

interface BackLinkProps {
  className?: string
  /** 브라우저 히스토리가 없을 때(새 탭 직접 진입 등) 갈 곳 — 이 페이지의 상위 맥락(목록/홈 등)을 명시적으로 지정 */
  fallbackHref: string
  /**
   * true면(콘텐츠 상세 "전체 페이지" 전용) 우선순위를 referrer → 히스토리 → 홈으로 바꾼다.
   * 새 탭으로 열린 콘텐츠 카드는 window.history가 비어 있어 항상 fallbackHref로
   * 떨어지는데, document.referrer(같은 오리진이면 전체 경로+쿼리 보존)가 실제
   * "클릭해서 넘어온 페이지"를 더 정확히 가리킨다. 인터셉트 모달은 이 컴포넌트를
   * 그대로 재사용하므로(useIsInsideContentDetailModal), 모달 안에서는 이 prop이
   * true여도 무시하고 기존 동작(모달 닫기)을 유지한다.
   */
  referrerFallback?: boolean
}

type Decision =
  | { kind: 'pending' }
  | { kind: 'referrer'; url: string }
  | { kind: 'history' }
  | { kind: 'home' }

/**
 * "이전으로" — 홈/트렌딩/검색 등 어디서 왔든 실제 브라우저 히스토리로 되돌아간다.
 * 직접 진입(히스토리 없음) 시에만 fallbackHref로 대체(죽은 버튼 방지).
 */
export default function BackLink({ className, fallbackHref, referrerFallback = false }: BackLinkProps) {
  const router = useRouter()
  const insideModal = useIsInsideContentDetailModal()
  const useReferrerPriority = referrerFallback && !insideModal

  const [hasHistory, setHasHistory] = useState(false)
  const [decision, setDecision] = useState<Decision>({ kind: 'pending' })

  useEffect(() => {
    const historyAvailable = window.history.length > 1
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 마운트 후 1회 window.history 판정(허용 패턴)
    setHasHistory(historyAvailable)

    if (!useReferrerPriority) return

    let referrerUrl: string | null = null
    if (document.referrer) {
      try {
        const referrer = new URL(document.referrer)
        if (referrer.origin === window.location.origin) {
          referrerUrl = referrer.pathname + referrer.search + referrer.hash
        }
      } catch {
        referrerUrl = null
      }
    }

    setDecision(
      referrerUrl
        ? { kind: 'referrer', url: referrerUrl }
        : historyAvailable
          ? { kind: 'history' }
          : { kind: 'home' }
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 마운트 시 1회만 판정하면 됨(referrerFallback/insideModal은 렌더 중 안 바뀜)
  }, [])

  if (useReferrerPriority) {
    if (decision.kind === 'referrer') {
      return (
        <button type="button" onClick={() => router.push(decision.url)} className={className}>
          <ArrowLeft className="h-4 w-4" />
          이전으로
        </button>
      )
    }
    if (decision.kind === 'history') {
      return (
        <button type="button" onClick={() => router.back()} className={className}>
          <ArrowLeft className="h-4 w-4" />
          이전으로
        </button>
      )
    }
    // pending(mount 전 첫 페인트)과 home 판정 모두 홈 링크로 렌더 — 판정 전에도
    // 죽은 버튼 없이 항상 동작하는 링크를 보여준다.
    return (
      <Link href="/dashboard" prefetch={false} className={className}>
        <ArrowLeft className="h-4 w-4" />
        이전으로
      </Link>
    )
  }

  if (hasHistory) {
    return (
      <button type="button" onClick={() => router.back()} className={className}>
        <ArrowLeft className="h-4 w-4" />
        이전으로
      </button>
    )
  }

  return (
    <Link href={fallbackHref} prefetch={false} className={className}>
      <ArrowLeft className="h-4 w-4" />
      이전으로
    </Link>
  )
}
