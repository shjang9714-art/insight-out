'use client'

import { createContext, useContext, type ReactNode } from 'react'

// 콘텐츠 상세(/dashboard/contents/[id])는 인터셉트 모달(@modal/(.)contents/[id])과
// 전체 페이지(직접/새 탭 진입)가 완전히 같은 서버 컴포넌트(ContentDetailPage)를
// 재사용한다. 그 안의 BackLink가 "referrer 기반 뒤로가기"(전체 페이지 전용)와
// "모달 닫기"(기존 동작 유지)를 구분하려면 자신이 모달 안에서 렌더 중인지 알아야
// 하는데, 서버 컴포넌트 트리만으로는 알 수 없다 — DetailSheet(모달 전용 조상)가
// 이 컨텍스트로 표시해준다. Provider가 없으면(=전체 페이지) 기본값 false.
const ContentDetailModalContext = createContext(false)

export function ContentDetailModalProvider({ children }: { children: ReactNode }) {
  return (
    <ContentDetailModalContext.Provider value={true}>
      {children}
    </ContentDetailModalContext.Provider>
  )
}

export function useIsInsideContentDetailModal(): boolean {
  return useContext(ContentDetailModalContext)
}
