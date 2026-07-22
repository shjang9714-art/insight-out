'use client'

// 279 — /admin/insights 의 주간 경쟁 리포트 생성 패널을 /admin/competitor-weekly 로 이동.
import { Loader2, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import AdminErrorBox from '@/components/admin/ui/AdminErrorBox'
import InfoHelp from '@/components/admin/ui/InfoHelp'
import { useEnrichJobs } from '@/components/admin/EnrichJobsProvider'
import { COMPETITOR_WEEKLY_HELP } from '@/lib/admin/help'
import { buildEnrichRunId } from '@/lib/admin/enrich-jobs'

export default function AdminCompetitorWeeklyGenerate() {
  const { runs, startJob } = useEnrichJobs()
  const runId = buildEnrichRunId('admin:competitor-weekly')
  const run = runs.get(runId)
  const isGenerating = run?.status === 'running'
  const hasFailed = run?.status === 'error' || run?.status === 'stopped' || run?.status === 'interrupted'

  return (
    <div className="rounded-xl border border-border bg-card p-5 space-y-4">
      <div className="flex items-center gap-1.5">
        <h2 className="text-sm font-semibold text-foreground">경쟁사 주간 브리핑 생성 (패스① 사실추출)</h2>
        <InfoHelp copy={COMPETITOR_WEEKLY_HELP} />
      </div>
      <p className="text-xs text-muted-foreground">
        경쟁사(통신 3사 중심) 기사를 사업영역별(AIDC·AICC·통신B2B·보안·클라우드·IT 등)로 종합해 위기·기회를 판정합니다. 기본은 최근 완결된 주(월~일).
      </p>
      <div className="flex items-center gap-3 flex-wrap">
        <Button
          onClick={() => startJob('admin:competitor-weekly', undefined, undefined, '주간 브리핑 생성')}
          disabled={isGenerating}
          size="sm"
          variant="brand"
        >
          {isGenerating ? (
            <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />생성 중...</>
          ) : (
            <><Sparkles className="h-3.5 w-3.5 mr-1.5" />경쟁사 주간 브리핑 생성</>
          )}
        </Button>
      </div>
      {run?.status === 'done' && (
        <p className="text-sm text-muted-foreground">
          생성 완료 — 발행 브리핑 탭에서 새 초안을 확인해주세요.
        </p>
      )}
      {hasFailed && <AdminErrorBox>{run.error ?? run.message}</AdminErrorBox>}
    </div>
  )
}
