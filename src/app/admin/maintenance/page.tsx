import type { Metadata } from 'next'
import { Trash2 } from 'lucide-react'
import AdminPageHeader from '@/components/admin/ui/AdminPageHeader'
import AdminSectionHeader from '@/components/admin/ui/AdminSectionHeader'
import AdminDataReset from '@/components/admin/AdminDataReset'

export const metadata: Metadata = {
  title: '시스템 유지보수 | 어드민 | Insight Out',
  description: '되돌릴 수 없는 수집 데이터 삭제·초기화 작업',
}

// 279 — /admin/content-data 의 Danger Zone(purge)만 이동. 스타일·확인 절차 불변.
export default function AdminMaintenancePage() {
  return (
    <>
      <AdminPageHeader />

      <div>
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
