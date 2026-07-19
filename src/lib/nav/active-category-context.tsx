'use client'

import { createContext, useContext, useState, type ReactNode } from 'react'

// 콘텐츠 상세(/dashboard/contents/[id])는 서버 컴포넌트라 실제 category(지식보고서/
// 가트너/KRG 등)를 알지만, 상단 네비(DashboardHeader)는 layout.tsx 아래 형제 트리라
// props로 못 받는다. 이 컨텍스트로 상세 페이지가 자신의 category를 알리면
// DashboardHeader가 L1/L2 활성 탭 판정에 반영한다.

interface ActiveCategoryContextValue {
  activeContentCategory: string | null
  setActiveContentCategory: (category: string | null) => void
}

const ActiveCategoryContext = createContext<ActiveCategoryContextValue | null>(null)

export function ActiveCategoryProvider({ children }: { children: ReactNode }) {
  const [activeContentCategory, setActiveContentCategory] = useState<string | null>(null)
  return (
    <ActiveCategoryContext.Provider value={{ activeContentCategory, setActiveContentCategory }}>
      {children}
    </ActiveCategoryContext.Provider>
  )
}

export function useActiveCategoryContext(): ActiveCategoryContextValue {
  const ctx = useContext(ActiveCategoryContext)
  if (!ctx) throw new Error('useActiveCategoryContext must be used within ActiveCategoryProvider')
  return ctx
}
