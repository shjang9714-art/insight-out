import type { Metadata } from 'next'
import { Suspense } from 'react'
import ActivityHub from '@/components/admin/ActivityHub'
import JobRunsPanel from '@/components/admin/panels/JobRunsPanel'
import AuditLogPanel from '@/components/admin/panels/AuditLogPanel'
import CrawlLogsPanel from '@/components/admin/panels/CrawlLogsPanel'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: '실행 이력 | 어드민 | Insight Out',
  description: '크론·일괄 작업 이력, 관리자 감사 로그, 수집 기술 로그를 통합 조회합니다.',
}

type ActivityTab = 'job-runs' | 'audit' | 'crawl-logs'

interface PageProps {
  searchParams: Promise<Record<string, string | undefined>>
}

// 524 — job-runs · audit-log · crawl-logs 통합(AdminTabShell 이식). href 는 /admin/job-runs 로 고정,
// 나머지 두 경로는 리다이렉트 스텁으로 남는다(딥링크 보존). 활성 탭에 해당하는 패널만 서버에서 조회한다.
export default async function AdminJobRunsPage({ searchParams }: PageProps) {
  const params = await searchParams
  const tab: ActivityTab = params.tab === 'audit' ? 'audit' : params.tab === 'crawl-logs' ? 'crawl-logs' : 'job-runs'

  return (
    <Suspense fallback={null}>
      <ActivityHub
        jobRunsPanel={tab === 'job-runs' ? <JobRunsPanel searchParams={params} /> : null}
        auditPanel={tab === 'audit' ? <AuditLogPanel /> : null}
        crawlLogsPanel={tab === 'crawl-logs' ? <CrawlLogsPanel searchParams={params} /> : null}
      />
    </Suspense>
  )
}
