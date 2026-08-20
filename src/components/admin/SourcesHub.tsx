'use client'

import type { ReactNode } from 'react'
import { Filter, Wrench } from 'lucide-react'
import AdminContentProcessing from '@/components/admin/AdminContentProcessing'
import AiJobsPanel from '@/components/admin/AiJobsPanel'
import CrawlSettings from '@/components/admin/CrawlSettings'
import ExclusionRulesManager from '@/components/admin/ExclusionRulesManager'
import SourceQualityManager from '@/components/admin/SourceQualityManager'
import AdminSectionHeader from '@/components/admin/ui/AdminSectionHeader'
import AdminTabShell from '@/components/admin/ui/AdminTabShell'
import { getEnrichJobs } from '@/lib/admin/enrich-jobs'

const DATA_JOBS = getEnrichJobs('data')
const SOURCE_TAB_PARAM_KEYS = ['page', 'sort', 'dir'] as const

const SOURCE_TABS = [
  { value: 'sources', label: '소스 목록' },
  { value: 'source-quality', label: '수집 품질' },
  { value: 'crawl-settings', label: '수집 설정' },
  { value: 'exclusion-rules', label: '제외 규칙' },
  { value: 'enrich', label: '데이터 보강 재처리' },
  { value: 'ai-jobs', label: 'AI 보강' },
]

interface SourcesHubProps {
  sourceListPanel: ReactNode | null
}

export default function SourcesHub({ sourceListPanel }: SourcesHubProps) {
  return (
    <AdminTabShell
      tabs={SOURCE_TABS}
      defaultTab="sources"
      aria-label="소스 관리"
      resetParamKeys={SOURCE_TAB_PARAM_KEYS}
      renderContent={(tab) => {
        if (tab === 'source-quality') return <SourceQualityManager />
        if (tab === 'crawl-settings') {
          return (
            <div>
              <AdminSectionHeader
                icon={Filter}
                title="수집 필터"
                hint="크롤 수집 시 적용되는 품질 기준을 조정합니다."
              />
              <CrawlSettings />
            </div>
          )
        }
        if (tab === 'exclusion-rules') return <ExclusionRulesManager />
        if (tab === 'enrich') {
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
        }
        if (tab === 'ai-jobs') return <AiJobsPanel />
        return sourceListPanel
      }}
    />
  )
}
