'use client'

import { useLayoutEffect } from 'react'
import { useActiveCategoryContext } from '@/lib/nav/active-category-context'

interface Props {
  category: string
}

// 지식보고서 등 리포트류 콘텐츠 상세에서 상단 네비가 "리포트" 탭을 활성으로
// 판정하도록 실제 category를 알림 — 원인·수정 배경은 active-category-context.tsx 참고.
//
// 카드 클릭으로 진입한 경우엔 링크에 실린 ?category= 쿼리파라미터를 DashboardHeader가
// 첫 렌더에 바로 읽어(§20260720 지시서) 이 컴포넌트 없이도 깜빡임이 없다. 이 컴포넌트는
// 그 파라미터가 없는 진입(인용 링크 등)을 위한 폴백이다 — useEffect 대신
// useLayoutEffect를 써서 브라우저가 페인트하기 전에 커밋되도록 해 깜빡임 창을 최소화한다.
export default function RecordActiveCategoryHint({ category }: Props) {
  const { setActiveContentCategory } = useActiveCategoryContext()

  useLayoutEffect(() => {
    setActiveContentCategory(category)
    return () => setActiveContentCategory(null)
  }, [category, setActiveContentCategory])

  return null
}
