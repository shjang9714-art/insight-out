'use client'

import { useEffect } from 'react'
import { useActiveCategoryContext } from '@/lib/nav/active-category-context'

interface Props {
  category: string
}

// 지식보고서 등 리포트류 콘텐츠 상세에서 상단 네비가 "리포트" 탭을 활성으로
// 판정하도록 실제 category를 알림 — 원인·수정 배경은 active-category-context.tsx 참고.
export default function RecordActiveCategoryHint({ category }: Props) {
  const { setActiveContentCategory } = useActiveCategoryContext()

  useEffect(() => {
    setActiveContentCategory(category)
    return () => setActiveContentCategory(null)
  }, [category, setActiveContentCategory])

  return null
}
