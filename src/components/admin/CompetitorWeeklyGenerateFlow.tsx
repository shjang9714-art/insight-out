'use client'

import { useEffect } from 'react'
import { ChevronDown } from 'lucide-react'
import { useRouter } from 'next/navigation'
import AdminCompetitorWeeklyGenerate from '@/components/admin/AdminCompetitorWeeklyGenerate'
import AdminCompetitorWeeklyAnalyze from '@/components/admin/AdminCompetitorWeeklyAnalyze'
import AdminCompetitorWeeklySchedule from '@/components/admin/AdminCompetitorWeeklySchedule'
import type { CompetitorWeeklyRow } from '@/components/admin/CompetitorWeeklyManager'
import { useEnrichJobs } from '@/components/admin/EnrichJobsProvider'
import InfoHelp from '@/components/admin/ui/InfoHelp'
import { buildEnrichRunId } from '@/lib/admin/enrich-jobs'
import {
  COMPETITOR_WEEKLY_HELP,
  COMPETITOR_WEEKLY_SCHEDULE_HELP,
} from '@/lib/admin/help'

interface CompetitorWeeklyGenerateFlowProps {
  reports: CompetitorWeeklyRow[]
}

export function CompetitorWeeklyGenerateFlow({ reports }: CompetitorWeeklyGenerateFlowProps) {
  const router = useRouter()
  const { runs } = useEnrichJobs()
  const runStatus = runs.get(buildEnrichRunId('admin:competitor-weekly'))?.status
  const reportsKey = reports.map((report) => `${report.id}:${report.generated_at}`).join('|')

  useEffect(() => {
    if (runStatus === 'done') router.refresh()
  }, [router, runStatus])

  return (
    <div className="space-y-9">
      <section aria-labelledby="competitor-weekly-step-one" className="grid gap-4 sm:grid-cols-[3rem_minmax(0,1fr)]">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-600 text-lg font-semibold text-white">
          ①
        </div>
        <div className="min-w-0 space-y-4">
          <div>
            <div className="flex items-center gap-1.5">
              <h2 id="competitor-weekly-step-one" className="text-lg font-semibold text-foreground">
                사실 추출
              </h2>
              <InfoHelp copy={COMPETITOR_WEEKLY_HELP} />
            </div>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              지난주 경쟁사 기사를 사업영역별로 모아 사실만 뽑습니다. 아래 버튼을 누르면 자동으로 진행됩니다.
              몇 분 걸릴 수 있어요.
            </p>
          </div>
          <AdminCompetitorWeeklyGenerate />
        </div>
      </section>

      <section aria-labelledby="competitor-weekly-step-two" className="grid gap-4 border-t border-border pt-9 sm:grid-cols-[3rem_minmax(0,1fr)]">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-600 text-lg font-semibold text-white">
          ②
        </div>
        <div className="min-w-0 space-y-4">
          <div>
            <h2 id="competitor-weekly-step-two" className="text-lg font-semibold text-foreground">
              분석
            </h2>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              ①이 끝난 주를 골라 프롬프트+데이터를 복사하고, 원하는 LLM(Claude·GPT 등)에 붙여넣은 뒤
              결과 JSON을 다시 붙여넣어 저장합니다.
            </p>
          </div>
          <AdminCompetitorWeeklyAnalyze key={reportsKey} reports={reports} />
        </div>
      </section>

      <details className="group border-t border-border pt-6">
        <summary className="flex cursor-pointer list-none items-start justify-between gap-4 rounded-lg px-1 py-2">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-base font-semibold text-foreground">자동 생성 스케줄</span>
              <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                설정
              </span>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              생성 순서와 별개입니다. 매주 정해진 요일·시각에 ①을 자동 실행할지 설정합니다. (하루 1회, 402)
            </p>
          </div>
          <ChevronDown className="mt-1 h-5 w-5 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
        </summary>
        <div className="mt-4 pl-0 sm:pl-12">
          <div className="mb-2 flex justify-end">
            <InfoHelp copy={COMPETITOR_WEEKLY_SCHEDULE_HELP} />
          </div>
          <AdminCompetitorWeeklySchedule />
        </div>
      </details>
    </div>
  )
}
