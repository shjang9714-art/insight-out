'use client'

import { useLayoutEffect, useState } from 'react'
import { cn } from '@/lib/utils'

interface Props {
  children: React.ReactNode
  className?: string
}

// 헤더(Lv.1)가 늦게 마운트되는 경우를 대비한 재시도 한도 — 대략 300ms(20 프레임) 안에는
// 같은 커밋에서 함께 그려지므로 충분하고, 그래도 못 찾으면 marginLeft 0으로 조용히 폴백.
const MAX_RETRY_FRAMES = 20

/**
 * L2 하위 카테고리 탭 그룹의 좌측 시작점을, 현재 활성 L1 탭(DashboardHeader) 라벨의
 * 텍스트 시작 x좌표에 맞춘다(§지시서 20260712). L1 탭은 콘텐츠 너비라 활성 탭마다
 * 텍스트 시작 위치가 달라 고정 오프셋 하드코딩이 불가능 — 마운트 시 실측하고
 * resize·폰트 로딩 완료 시 재측정한다.
 *
 * L1과 L2는 서로 다른 컴포넌트 트리(전역 헤더 vs 페이지 콘텐츠)라 DOM id로 연결한다
 * (`#l1-nav-row`, `#l1-active-label`). L1 nav가 숨겨지는 모바일 폭(`md` 미만)이나
 * 헤더가 아직 마운트되지 않은 경우엔 기준점이 없으므로 marginLeft 0(좌측 정렬)로 폴백—
 * null 참조로 죽지 않는다.
 */
export default function NavGroupAlign({ children, className }: Props) {
  const [marginLeft, setMarginLeft] = useState(0)

  useLayoutEffect(() => {
    let rafId = 0
    let retries = 0
    let cancelled = false

    function measure() {
      const label = document.getElementById('l1-active-label')
      const navRow = document.getElementById('l1-nav-row')

      if (!label || !navRow) {
        if (!cancelled && retries < MAX_RETRY_FRAMES) {
          retries += 1
          rafId = requestAnimationFrame(measure)
        }
        return
      }

      const navRect = navRow.getBoundingClientRect()
      if (navRect.width === 0) {
        // 모바일 폭 등 L1 nav가 hidden 처리된 상태 — 기준점 없음, 좌측 정렬로 폴백
        setMarginLeft(0)
        return
      }

      const labelRect = label.getBoundingClientRect()
      setMarginLeft(Math.max(0, labelRect.left - navRect.left))
    }

    measure()
    window.addEventListener('resize', measure)
    document.fonts?.ready?.then(() => {
      if (!cancelled) measure()
    })

    return () => {
      cancelled = true
      window.removeEventListener('resize', measure)
      if (rafId) cancelAnimationFrame(rafId)
    }
  }, [])

  return (
    <div className={cn('w-fit', className)} style={{ marginLeft }}>
      {children}
    </div>
  )
}
