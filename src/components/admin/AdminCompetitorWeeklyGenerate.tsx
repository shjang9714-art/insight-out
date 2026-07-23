'use client'

// 279 — /admin/insights 의 주간 경쟁 리포트 생성 패널을 /admin/competitor-weekly 로 이동.
import { Loader2, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import AdminErrorBox from '@/components/admin/ui/AdminErrorBox'
import { useEnrichJobs } from '@/components/admin/EnrichJobsProvider'
import { buildEnrichRunId } from '@/lib/admin/enrich-jobs'

export default function AdminCompetitorWeeklyGenerate() {
  const { runs, startJob } = useEnrichJobs()
  const runId = buildEnrichRunId('admin:competitor-weekly')
  const run = runs.get(runId)
  const isGenerating = run?.status === 'running'
  const hasFailed = run?.status === 'error' || run?.status === 'stopped' || run?.status === 'interrupted'

  return (
    <div className="rounded-xl border border-border bg-card p-5 space-y-4">
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
          생성 완료 — 경쟁사 주간 브리핑 메뉴에서 새 초안을 확인해주세요.
        </p>
      )}
      {hasFailed && <AdminErrorBox>{run.error ?? run.message}</AdminErrorBox>}
    </div>
  )
}
