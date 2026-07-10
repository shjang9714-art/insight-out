import type { Metadata } from 'next'
import { Filter } from 'lucide-react'
import AdminPageHeader from '@/components/admin/ui/AdminPageHeader'
import AdminSectionHeader from '@/components/admin/ui/AdminSectionHeader'
import CrawlSettings from '@/components/admin/CrawlSettings'

export const metadata: Metadata = {
  title: '수집 설정 | 어드민 | Insight Out',
  description: '크롤 수집 시 적용되는 품질 기준(최소 본문 길이)을 조정합니다.',
}

// 280 — /admin/settings 에서 이동. API 불변(GET/PATCH /api/admin/crawl-settings).
export default function AdminCrawlSettingsPage() {
  return (
    <>
      <AdminPageHeader />
      <AdminSectionHeader
        icon={Filter}
        title="수집 필터"
        hint="크롤 수집 시 적용되는 품질 기준을 조정합니다."
      />
      <CrawlSettings />
    </>
  )
}
