'use client'

import { createContext, useContext, useState, type ReactNode } from 'react'

// 콘텐츠 상세(/dashboard/contents/[id])는 서버 컴포넌트라 실제 category(지식보고서/
// 가트너/KRG 등)를 알지만, 상단 네비(DashboardHeader)는 layout.tsx 아래 형제 트리라
// props로 못 받는다. 이 컨텍스트로 상세 페이지가 자신의 category를 알리면
// DashboardHeader가 L1/L2 활성 탭 판정에 반영한다.
//
// initialCategory(§20260720 fix/nav-active-server-side) — layout.tsx(서버 컴포넌트)가
// x-pathname 헤더로 현재 라우트가 콘텐츠 상세인지 보고 category를 직접 조회해 넘겨준
// 값. 이 값이 있으면 useState 초기값부터 정확해 첫 SSR 페인트부터 올바른 탭이 뜬다
// (링크의 ?category나 RecordActiveCategoryHint의 useLayoutEffect를 기다릴 필요 없음
// — 새로고침·직접 URL 진입처럼 그 둘 다 없는 경로를 커버).

interface ActiveCategoryContextValue {
  activeContentCategory: string | null
  setActiveContentCategory: (category: string | null) => void
}

const ActiveCategoryContext = createContext<ActiveCategoryContextValue | null>(null)

export function ActiveCategoryProvider({
  children,
  initialCategory = null,
}: {
  children: ReactNode
  initialCategory?: string | null
}) {
  const [activeContentCategory, setActiveContentCategory] = useState<string | null>(initialCategory)
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
