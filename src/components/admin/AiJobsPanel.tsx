'use client'

import { Loader2, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import AdminSectionHeader from '@/components/admin/ui/AdminSectionHeader'
import InfoHelp from '@/components/admin/ui/InfoHelp'
import { useEnrichJobs } from '@/components/admin/EnrichJobsProvider'
import {
  LGU_IMPACT_HELP,
  SENTIMENT_HELP,
  YOUTUBE_SUMMARY_HELP,
} from '@/lib/admin/help'
import { getEnrichJobs, type EnrichJobKey } from '@/lib/admin/enrich-jobs'

const AI_JOBS = getEnrichJobs('ai')

function getJobCopy(key: EnrichJobKey): { description: string; button: string; help?: React.ReactNode } {
  switch (key) {
    case 'admin:sentiment':
      return {
        description: '최근 추적 기업·이슈 기사의 논조를 LLM으로 분석합니다.',
        button: '논조 분석 실행',
        help: <InfoHelp copy={SENTIMENT_HELP} />,
      }
    case 'admin:lgu-impact':
      return {
        description: '최근 경쟁사 기사를 LG U+ 관점의 위기·기회로 분석합니다.',
        button: '위기·기회 분석 실행',
        help: <InfoHelp copy={LGU_IMPACT_HELP} />,
      }
    case 'admin:youtube-summary':
      return {
        description: '요약 없는 유튜브에 제목·채널 기반 요약을 생성합니다. 신규 수집분은 수집 시 자동 생성됩니다.',
        button: '유튜브 요약 생성 실행',
        help: <InfoHelp copy={YOUTUBE_SUMMARY_HELP} />,
      }
    case 'admin:summary-backfill':
      return {
        description: '요약이 없는 발행 콘텐츠를 LLM으로 요약합니다. 매일 05:20 크론이 돌지만 지금 바로 실행할 수 있습니다.',
        button: '뉴스 요약 백필',
      }
    case 'admin:signals-backfill':
      return {
        description: '기사를 이벤트 유형(투자·M&A·규제·신제품 등)으로 자동 태깅합니다.',
        button: '신호 분류',
      }
    default:
      throw new Error(`[ai-jobs] ${key} 작업 렌더러가 없습니다.`)
  }
}

export default function AiJobsPanel() {
  const { runs, startJob } = useEnrichJobs()

  return (
    <div>
      <AdminSectionHeader icon={Sparkles} title="AI 콘텐츠 보강" hint="LLM을 사용하는 콘텐츠 분석·요약 작업만 실행합니다." />
      <div className="space-y-4">
        {AI_JOBS.map((job) => {
          const copy = getJobCopy(job.key)
          const isRunning = runs.get(job.key)?.status === 'running'
          return (
            <div key={job.key} className="rounded-xl border border-border bg-card p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <h3 className="text-sm font-semibold text-foreground">{job.label}</h3>
                    {copy.help}
                    {isRunning && (
                      <span className="ml-1 inline-flex items-center gap-1 text-xs font-medium text-brand-600">
                        <Loader2 className="h-3 w-3 animate-spin" />실행 중
                      </span>
                    )}
                  </div>
                  <p className="mt-1 max-w-lg text-xs text-muted-foreground">{copy.description}</p>
                </div>
                <Button type="button" size="sm" variant="outline" className="shrink-0" disabled={isRunning} onClick={() => startJob(job.key)}>
                  {copy.button}
                </Button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
