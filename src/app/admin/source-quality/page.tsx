import type { Metadata } from 'next'
import SourceQualityManager from '@/components/admin/SourceQualityManager'
import AdminPageHeader from '@/components/admin/ui/AdminPageHeader'

export const metadata: Metadata = {
  title: '소스 품질 | 어드민 | Insight Out',
  description: '소스별 수집 상태·품질 지표 확인 및 크롤 실행 트리거',
}

// 280 — /admin/sources 에서 수집 상태·품질·크롤 실행 트리거를 분리
export default function AdminSourceQualityPage() {
  return (
    <>
      <AdminPageHeader />
      <SourceQualityManager />
    </>
  )
}
