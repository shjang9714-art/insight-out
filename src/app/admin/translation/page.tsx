import type { Metadata } from 'next'
import TranslationStatusManager from '@/components/admin/TranslationStatusManager'
import AdminPageHeader from '@/components/admin/ui/AdminPageHeader'

export const metadata: Metadata = {
  title: '번역 | 어드민 | Insight Out',
  description: '번역 공급자 연결 상태와 월간 사용량을 관리합니다.',
}

export default function AdminTranslationPage() {
  return (
    <div className="space-y-6">
      <AdminPageHeader />
      <TranslationStatusManager />
    </div>
  )
}
