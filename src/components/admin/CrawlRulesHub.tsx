'use client'

import { Filter, Wrench } from 'lucide-react'
import AdminTabShell from '@/components/admin/ui/AdminTabShell'
import AdminSectionHeader from '@/components/admin/ui/AdminSectionHeader'
import CrawlSettings from '@/components/admin/CrawlSettings'
import ExclusionRulesManager from '@/components/admin/ExclusionRulesManager'
import AdminContentProcessing from '@/components/admin/AdminContentProcessing'
import { getEnrichJobs } from '@/lib/admin/enrich-jobs'

const DATA_JOBS = getEnrichJobs('data')

const CRAWL_RULES_TABS = [
  { value: 'crawl-settings', label: '수집 설정' },
  { value: 'exclusion-rules', label: '제외 규칙' },
  { value: 'enrich', label: '데이터 보강 재처리' },
]

function renderCrawlRulesContent(tab: string) {
  switch (tab) {
    case 'exclusion-rules':
      return <ExclusionRulesManager />
    case 'enrich':
      return (
        <div>
          <AdminSectionHeader
            icon={Wrench}
            title="데이터 보강 재처리"
            hint="LLM을 쓰지 않는 수집 데이터 보강·재처리 작업만 실행합니다."
          />
          <AdminContentProcessing jobs={DATA_JOBS} />
        </div>
      )
    default:
      return (
        <>
          <AdminSectionHeader
            icon={Filter}
            title="수집 필터"
            hint="크롤 수집 시 적용되는 품질 기준을 조정합니다."
          />
          <CrawlSettings />
        </>
      )
  }
}

/** 524 — 수집 설정·제외 규칙·데이터 보강 재처리 통합(AdminTabShell 이식). 전부 클라이언트 자체 fetch라 탭 전환 시 재사용만 하면 된다. */
export default function CrawlRulesHub() {
  return (
    <AdminTabShell
      tabs={CRAWL_RULES_TABS}
      defaultTab="crawl-settings"
      aria-label="수집 규칙"
      renderContent={renderCrawlRulesContent}
    />
  )
}
