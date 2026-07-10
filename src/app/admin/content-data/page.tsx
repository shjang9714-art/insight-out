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
        <AdminSectionHeader icon={Trash2} title="위험 구역 (Danger Zone)" hint="되돌릴 수 없는 삭제 작업입니다." />
        <details className="rounded-xl border-2 border-destructive/30 bg-destructive/5">
          <summary className="admin-card-title flex cursor-pointer select-none items-center gap-2 px-5 py-3 text-destructive">
            <Trash2 className="h-4 w-4 shrink-0" />
            위험 작업 펼치기 (수집 데이터 삭제·초기화)
          </summary>
          <div className="border-t border-destructive/20 p-5">
            <p className="admin-caption mb-4 text-destructive">
              ⚠️ 아래 작업은 되돌릴 수 없습니다. 삭제 전 반드시 대상 건수를 확인하세요.
            </p>
            <AdminDataReset />
          </div>
        </details>
      </div>
    </>
  )
}
