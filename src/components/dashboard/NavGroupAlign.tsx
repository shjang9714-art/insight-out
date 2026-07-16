'use client'

import { useLayoutEffect, useRef, useState } from 'react'
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
 * L1과 L2는 서로 다른 컴포넌트 트리(전역 헤더 vs 페이지 콘텐츠)일 수 있어 활성 라벨은
 * DOM id로 찾는다(`#l1-active-label`). 자기 자신의 marginLeft:0 기준 위치(baseLeft)를
 * 직접 재보고 그 차이만큼만 옮기므로, 감싸는 컨테이너의 padding 유무·크기와 무관하게
 * 항상 정확히 라벨의 x좌표에 맞는다(§지시서 20260716 — 이전엔 `#l1-nav-row`의 padding을
 * 이중으로 더해 컨테이너에 padding이 있는 경우 그만큼 어긋나는 버그가 있었음).
 * L1 nav가 숨겨지는 모바일 폭(`md` 미만)이나 헤더가 아직 마운트되지 않은 경우엔 라벨이
 * 없거나 폭이 0이라 marginLeft 0(좌측 정렬)로 자연히 폴백 — null 참조로 죽지 않는다.
 */
export default function NavGroupAlign({ children, className }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const [marginLeft, setMarginLeft] = useState(0)

  useLayoutEffect(() => {
    let rafId = 0
    let retries = 0
    let cancelled = false

    function measure() {
      const label = document.getElementById('l1-active-label')
      const el = ref.current

      if (!label || !el) {
        if (!cancelled && retries < MAX_RETRY_FRAMES) {
          retries += 1
          rafId = requestAnimationFrame(measure)
        }
        return
      }

      const appliedMarginLeft = parseFloat(getComputedStyle(el).marginLeft) || 0
      const baseLeft = el.getBoundingClientRect().left - appliedMarginLeft
      const labelRect = label.getBoundingClientRect()
      setMarginLeft(Math.max(0, labelRect.left - baseLeft))
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
    <div ref={ref} className={cn('w-fit', className)} style={{ marginLeft }}>
      {children}
    </div>
  )
}
