import { headers } from 'next/headers'
import { Suspense } from 'react'
import DashboardShell from '@/components/dashboard/DashboardShell'
import { ActiveCategoryProvider } from '@/lib/nav/active-category-context'
import { createClient } from '@/lib/supabase/server'

// DashboardHeader.tsx의 CONTENT_DETAIL_PATTERN과 반드시 동일해야 한다.
const CONTENT_DETAIL_PATTERN = /^\/dashboard\/contents\/([^/]+)$/

// 콘텐츠 상세(/dashboard/contents/[id])를 새로고침·직접 URL로 진입할 때, 링크의
// ?category=(카드 클릭 진입)도 RecordActiveCategoryHint의 mount 교정도 아직 없는
// "첫 서버 렌더" 시점에 상단 네비가 잘못된 기본 탭("콘텐츠 - 뉴스")을 그렸다가 튀는
// 깜빡임이 있었다(§20260720 fix/nav-active-server-side). 이 레이아웃이 서버에서
// 직접 category를 조회해 ActiveCategoryProvider의 초기값으로 주입하면, 그 값을
// 그대로 쓰는 DashboardHeader(클라이언트 컴포넌트)도 SSR HTML부터 이미 정확하다.
//
// 참고: 이 초기값은 "첫 로드"에만 적용된다. 같은 레이아웃 아래에서 다른 콘텐츠
// 상세로 클라이언트 네비게이션(SPA)하는 경우, 공통 레이아웃(이 파일)은 재실행되지
// 않으므로 기존 ?category 쿼리(있으면 즉시) 또는 RecordActiveCategoryHint(없으면
// mount 시 폴백)가 계속 그 역할을 한다 — 둘 다 그대로 유지.
async function resolveInitialCategory(pathname: string): Promise<string | null> {
  const match = CONTENT_DETAIL_PATTERN.exec(pathname)
  if (!match) return null

  const id = match[1]
  const supabase = await createClient()
  const { data } = await supabase
    .from('contents')
    .select('category')
    .eq('id', id)
    .eq('status', 'published')
    .single()

  return (data as { category: string } | null)?.category ?? null
}

export default async function DashboardLayout({
  children,
  modal,
}: {
  children: React.ReactNode
  modal: React.ReactNode
}) {
  const hdrs = await headers()
  const pathname = hdrs.get('x-pathname') ?? ''
  const initialCategory = await resolveInitialCategory(pathname)

  return (
    <ActiveCategoryProvider initialCategory={initialCategory}>
      <Suspense fallback={<div className="min-h-screen bg-background" />}>
        <DashboardShell>{children}</DashboardShell>
      </Suspense>
      {modal}
    </ActiveCategoryProvider>
  )
}
