import type { Metadata } from 'next'
import { Trash2, Wrench } from 'lucide-react'
import AdminPageHeader from '@/components/admin/ui/AdminPageHeader'
import AdminSectionHeader from '@/components/admin/ui/AdminSectionHeader'
import AdminContentProcessing from '@/components/admin/AdminContentProcessing'
import AdminDataReset from '@/components/admin/AdminDataReset'

export const metadata: Metadata = {
  title: '콘텐츠 데이터 관리 | 어드민 | Insight Out',
  description: '풀본문·신호 분류·URL 정규화·수집 데이터 삭제',
}

export default function AdminContentDataPage() {
  return (
    <>
      <AdminPageHeader />

      <div>
        <AdminSectionHeader icon={Wrench} title="일괄 처리" hint="수집 기사에 대한 처리 작업" />
        <AdminContentProcessing />
      </div>

      <div className="mt-10">
        <AdminSectionHeader icon={Trash2} title="삭제·초기화" hint="되돌릴 수 없으니 주의하세요." />
        <AdminDataReset />
      </div>
    </>
  )
}
