import type { Metadata } from 'next'
import { LayoutTemplate } from 'lucide-react'
import AdminPageHeader from '@/components/admin/ui/AdminPageHeader'
import AdminSectionHeader from '@/components/admin/ui/AdminSectionHeader'
import HomeSectionsSettings from '@/components/admin/HomeSectionsSettings'

export const metadata: Metadata = {
  title: '홈 화면 구성 | 어드민 | Insight Out',
  description: '방문자에게 보이는 홈 화면의 항목과 순서를 관리합니다.',
}

// 280 — /admin/settings 에서 이동. API 불변(GET/PUT /api/admin/homepage).
export default function AdminHomepageSectionsPage() {
  return (
    <>
      <AdminPageHeader />
      <AdminSectionHeader
        icon={LayoutTemplate}
        title="공개 홈 구성"
        hint="방문자에게 보이는 홈 화면의 항목과 순서를 정합니다. 모든 방문자에게 적용됩니다."
      />
      <HomeSectionsSettings />
    </>
  )
}
