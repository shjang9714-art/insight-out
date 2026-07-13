import { Wrench } from 'lucide-react'
import AdminContentProcessing from '@/components/admin/AdminContentProcessing'
import AdminPageHeader from '@/components/admin/ui/AdminPageHeader'
import AdminSectionHeader from '@/components/admin/ui/AdminSectionHeader'
import { getEnrichJobs } from '@/lib/admin/enrich-jobs'

const DATA_JOBS = getEnrichJobs('data')

export default function AdminEnrichPage() {
  return (
    <div className="space-y-10">
      <AdminPageHeader />

      <div>
        <AdminSectionHeader
          icon={Wrench}
          title="데이터 보강 재처리"
          hint="LLM을 쓰지 않는 수집 데이터 보강·재처리 작업만 실행합니다."
        />
        <AdminContentProcessing jobs={DATA_JOBS} />
      </div>
    </div>
  )
}
