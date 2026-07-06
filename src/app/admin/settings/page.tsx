import type { Metadata } from 'next'
import { Database, LayoutTemplate } from 'lucide-react'
import AdminPageHeader from '@/components/admin/ui/AdminPageHeader'
import AdminSectionHeader from '@/components/admin/ui/AdminSectionHeader'
import AdminAppearanceSettings from '@/components/admin/AdminAppearanceSettings'
import HomeSectionsSettings from '@/components/admin/HomeSectionsSettings'
import AdminDataReset from '@/components/admin/AdminDataReset'

export const metadata: Metadata = {
  title: '시스템 설정 | 어드민 | Insight Out',
  description: '어드민 콘솔 화면 테마·폰트·색상 설정',
}

export default function AdminSettingsPage() {
  return (
    <>
      <AdminPageHeader />
      <AdminAppearanceSettings />

      <div className="mt-10">
        <AdminSectionHeader
          icon={LayoutTemplate}
          title="공개 홈 구성"
          hint="방문자에게 보이는 홈 화면의 항목과 순서를 정합니다. 모든 방문자에게 적용됩니다."
        />
        <HomeSectionsSettings />
      </div>

      <div className="mt-10">
        <AdminSectionHeader
          icon={Database}
          title="데이터 관리"
          hint="수집 데이터 초기화. 되돌릴 수 없으니 주의하세요."
        />
        <AdminDataReset />
      </div>
    </>
  )
}
