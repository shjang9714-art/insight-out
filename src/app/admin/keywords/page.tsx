import type { Metadata } from 'next'
import { Suspense } from 'react'
import KeywordsHub from '@/components/admin/KeywordsHub'
import TaxonomyPanel from '@/components/admin/panels/TaxonomyPanel'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: '사전·분류 | 어드민 | Insight Out',
  description: '분류 키워드, 수집 키워드그룹·시그널 기준, 카테고리 매핑, 엔티티 사전을 통합 관리합니다.',
}

interface PageProps {
  searchParams: Promise<Record<string, string | undefined>>
}

// 524 — keywords · keyword-groups · taxonomy · entities 통합(AdminTabShell 이식). href 는
// /admin/keywords 로 고정, 나머지 세 경로는 리다이렉트 스텁으로 남는다(딥링크 보존).
// taxonomy 만 service_role 전용 서버 조회라 활성 탭일 때만 미리 렌더해 슬롯으로 넘긴다.
export default async function AdminKeywordsPage({ searchParams }: PageProps) {
  const params = await searchParams
  const tab = params.tab === 'taxonomy' ? 'taxonomy' : null

  return (
    <Suspense fallback={null}>
      <KeywordsHub taxonomyPanel={tab === 'taxonomy' ? <TaxonomyPanel /> : null} />
    </Suspense>
  )
}
