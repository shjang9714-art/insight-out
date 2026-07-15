import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import {
  isKnowledgeReportSchemaMissing,
  type KnowledgeReportAdminItem,
} from '@/lib/knowledge-reports/admin'
import AdminErrorBox from '@/components/admin/ui/AdminErrorBox'
import AdminPageHeader from '@/components/admin/ui/AdminPageHeader'
import KnowledgeReportManager from '@/components/admin/KnowledgeReportManager'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: '지식보고서 관리 | 어드민 | Insight Out',
  description: '내부 지식보고서 PDF·PPTX 파일과 사용자 노출 정보를 관리합니다.',
}

export default async function KnowledgeReportsAdminPage() {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('contents')
    .select('id, title, summary_ko, file_path, matched_keywords, status, created_at, updated_at')
    .eq('category', '지식보고서')
    .neq('status', 'rejected')
    .order('created_at', { ascending: false })

  const schemaReady = !isKnowledgeReportSchemaMissing(error)
  const reports = schemaReady && !error ? (data ?? []) as KnowledgeReportAdminItem[] : []

  return (
    <div className="space-y-8">
      <AdminPageHeader />
      {!schemaReady ? (
        <AdminErrorBox>
          357-B 지식보고서 카테고리 SQL이 아직 적용되지 않았습니다. SQL 적용 후 업로드할 수 있습니다.
        </AdminErrorBox>
      ) : error ? (
        <AdminErrorBox>지식보고서 목록을 불러오지 못했습니다. 잠시 후 다시 시도해주세요.</AdminErrorBox>
      ) : null}
      <KnowledgeReportManager initialReports={reports} schemaReady={schemaReady && !error} />
    </div>
  )
}
