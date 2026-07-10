import type { Metadata } from 'next'
import AdminPageHeader from '@/components/admin/ui/AdminPageHeader'
import AdminAppearanceSettings from '@/components/admin/AdminAppearanceSettings'

export const metadata: Metadata = {
  title: '시스템 설정 | 어드민 | Insight Out',
  description: '어드민 콘솔 화면 테마·폰트·색상 설정',
}

// 280 — 어드민 화면 설정만 잔존. 홈 화면 구성→/admin/homepage-sections, 수집 설정→/admin/crawl-settings 로 이동.
export default function AdminSettingsPage() {
  return (
    <>
      <AdminPageHeader />
      <AdminAppearanceSettings />
    </>
  )
}
