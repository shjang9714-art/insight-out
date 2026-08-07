import type { Metadata } from 'next'
import { Suspense } from 'react'
import SystemSettingsHub from '@/components/admin/SystemSettingsHub'
import OpsSettingsPanel from '@/components/admin/OpsSettingsPanel'

export const metadata: Metadata = {
  title: '시스템 설정 | 어드민 | Insight Out',
  description: '어드민 콘솔 화면 테마·폰트·색상 설정',
}

export default function AdminSettingsPage() {
  return (
    <Suspense fallback={null}>
      <SystemSettingsHub />
      <OpsSettingsPanel />
    </Suspense>
  )
}
