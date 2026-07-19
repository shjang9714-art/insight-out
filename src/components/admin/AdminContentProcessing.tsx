'use client'

import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import InfoHelp from '@/components/admin/ui/InfoHelp'
import { useEnrichJobs } from '@/components/admin/EnrichJobsProvider'
import { YOUTUBE_TAGGING_HELP } from '@/lib/admin/help'
import { requireEnrichJob, type EnrichJobKey, type EnrichJobMeta } from '@/lib/admin/enrich-jobs'

const ENRICH_RANGE_PRESETS: { label: string; days: number | null }[] = [
  { label: '최근 7일', days: 7 },
  { label: '최근 30일', days: 30 },
  { label: '최근 90일', days: 90 },
  { label: '전체', days: null },
]

interface Props {
  jobs: readonly EnrichJobMeta[]
}

interface JobCardProps {
  job: EnrichJobMeta
  description: React.ReactNode
  children: React.ReactNode
  isRunning: boolean
  help?: React.ReactNode
  /** 미처리 건수. null/undefined면 배지를 숨긴다("모름"과 "0건"은 다르다). */
  pending?: number | null
}

const DATA_JOB_RENDERERS: EnrichJobKey[] = [
  'admin:body-backfill',
  'admin:canonical-backfill',
  'admin:thumbnail-backfill',
  'admin:youtube-transcript',
  'admin:pdf-cover-backfill',
  'admin:cluster-backfill',
  'admin:youtube-tagging',
  'admin:translate-backfill',
]

function JobCard({ job, description, children, isRunning, help, pending }: JobCardProps) {
  return (
    <div className="rounded-xl bg-card p-5 ring-1 ring-foreground/10">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <p className="admin-card-title text-foreground">{job.label}</p>
            {help}
            {isRunning && (
              <span className="ml-1 inline-flex items-center gap-1 text-xs font-medium text-brand-600">
                <Loader2 className="h-3 w-3 animate-spin" />실행 중
              </span>
            )}
            {pending !== null && pending !== undefined && (
              pending > 0 ? (
                <span className="ml-1 text-xs font-medium text-amber-600">미처리 {pending}건</span>
              ) : (
                <span className="ml-1 text-xs text-muted-foreground">미처리 없음</span>
              )
            )}
          </div>
          <div className="admin-caption mt-1 max-w-lg text-muted-foreground">{description}</div>
        </div>
        <div className="flex shrink-0 gap-2">{children}</div>
      </div>
    </div>
  )
}

export default function AdminContentProcessing({ jobs }: Props) {
  for (const job of jobs) {
    if (!DATA_JOB_RENDERERS.includes(job.key)) {
      throw new Error(`[enrich-jobs] data 화면에 ${job.key} 렌더러가 없습니다.`)
    }
  }

  const bodyJob = requireEnrichJob(jobs, 'admin:body-backfill', 'data')
  const canonicalJob = requireEnrichJob(jobs, 'admin:canonical-backfill', 'data')
  const thumbnailJob = requireEnrichJob(jobs, 'admin:thumbnail-backfill', 'data')
  const transcriptJob = requireEnrichJob(jobs, 'admin:youtube-transcript', 'data')
  const pdfCoverJob = requireEnrichJob(jobs, 'admin:pdf-cover-backfill', 'data')
  const clusterJob = requireEnrichJob(jobs, 'admin:cluster-backfill', 'data')
  const youtubeTaggingJob = requireEnrichJob(jobs, 'admin:youtube-tagging', 'data')
  const translateJob = requireEnrichJob(jobs, 'admin:translate-backfill', 'data')
  const { runs, startJob } = useEnrichJobs()
  const [isRangeOpen, setIsRangeOpen] = useState(false)
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [counts, setCounts] = useState<Partial<Record<EnrichJobKey, number | null>>>({})

  // 388 — 실행 없이 미처리 건수만 조회(비차단: 실패해도 잡 목록·실행 버튼은 정상 동작).
  useEffect(() => {
    let cancelled = false
    fetch('/api/admin/backfill-status')
      .then((res) => (res.ok ? res.json() as Promise<{ counts?: Partial<Record<EnrichJobKey, number | null>> }> : null))
      .then((data) => {
        if (!cancelled && data?.counts) setCounts(data.counts)
      })
      .catch(() => {
        // 비차단 — 배지 숨김
      })
    return () => { cancelled = true }
  }, [])

  const isRunning = (key: EnrichJobKey) => runs.get(key)?.status === 'running'

  // 실행 후에는 응답의 remaining으로 갱신하고, 실행 전에는 초기 조회값을 쓴다.
  const pendingFor = (key: EnrichJobKey): number | null | undefined => {
    const runRemaining = runs.get(key)?.remaining
    if (runRemaining !== null && runRemaining !== undefined) return runRemaining
    return counts[key]
  }

  const applyRangePreset = (days: number | null) => {
    if (days === null) {
      setFrom('')
      setTo('')
      return
    }
    const end = new Date()
    const start = new Date()
    start.setDate(start.getDate() - days)
    setFrom(start.toISOString().slice(0, 10))
    setTo(end.toISOString().slice(0, 10))
  }

  const startBodyBackfill = () => {
    setIsRangeOpen(false)
    startJob(bodyJob.key, { from: from || null, to: to || null })
  }

  return (
    <div className="space-y-4">
      <JobCard
        job={bodyJob}
        isRunning={isRunning(bodyJob.key)}
        pending={pendingFor(bodyJob.key)}
        description={<>기사 본문을 원문에서 가져와 채웁니다. 기간을 골라 실행합니다.<br />추출 성공률은 약 60%이며 구글뉴스·봇 차단 사이트는 구조적으로 실패할 수 있습니다.</>}
      >
        <Button type="button" size="sm" variant="outline" disabled={isRunning(bodyJob.key)} onClick={() => setIsRangeOpen(true)}>
          누락 기사 본문 수집
        </Button>
      </JobCard>

      <JobCard job={canonicalJob} isRunning={isRunning(canonicalJob.key)} pending={pendingFor(canonicalJob.key)} description="구글뉴스 등 리다이렉트 주소를 실제 원문 주소로 정리합니다.">
        <Button type="button" size="sm" variant="outline" disabled={isRunning(canonicalJob.key)} onClick={() => startJob(canonicalJob.key)}>
          원문 URL 정규화
        </Button>
      </JobCard>

      <JobCard job={thumbnailJob} isRunning={isRunning(thumbnailJob.key)} pending={pendingFor(thumbnailJob.key)} description="썸네일이 없는 크롤 뉴스·웹인사이트의 원문 og:image를 다시 받아옵니다.">
        <Button type="button" size="sm" variant="outline" disabled={isRunning(thumbnailJob.key)} onClick={() => startJob(thumbnailJob.key, { mode: 'fresh' })}>
          아직 시도 안 함
        </Button>
        <Button type="button" size="sm" variant="outline" disabled={isRunning(thumbnailJob.key)} onClick={() => startJob(thumbnailJob.key, { mode: 'retry' })}>
          실패행 재시도
        </Button>
      </JobCard>

      <JobCard job={transcriptJob} isRunning={isRunning(transcriptJob.key)} pending={pendingFor(transcriptJob.key)} description="유튜브 영상의 자막을 수집해 한글로 번역합니다. 비공식 엔드포인트를 순차 호출하므로 rate limit에 주의하세요.">
        <Button type="button" size="sm" variant="outline" disabled={isRunning(transcriptJob.key)} onClick={() => startJob(transcriptJob.key, { mode: 'fresh' })}>
          아직 시도 안 함
        </Button>
        <Button type="button" size="sm" variant="outline" disabled={isRunning(transcriptJob.key)} onClick={() => startJob(transcriptJob.key, { mode: 'retry' })}>
          실패행 재시도
        </Button>
      </JobCard>

      <JobCard job={pdfCoverJob} isRunning={isRunning(pdfCoverJob.key)} pending={pendingFor(pdfCoverJob.key)} description="업로드된 PDF의 첫 페이지를 표지로 설정합니다. 표지가 이미 있으면 건너뜁니다.">
        <Button type="button" size="sm" variant="outline" disabled={isRunning(pdfCoverJob.key)} onClick={() => startJob(pdfCoverJob.key, { mode: 'fresh' })}>
          아직 시도 안 함
        </Button>
        <Button type="button" size="sm" variant="outline" disabled={isRunning(pdfCoverJob.key)} onClick={() => startJob(pdfCoverJob.key, { mode: 'retry' })}>
          실패행 재시도
        </Button>
      </JobCard>

      <JobCard job={clusterJob} isRunning={isRunning(clusterJob.key)} pending={pendingFor(clusterJob.key)} description="제목만으로 못 묶인 같은 사건 기사를 본문 유사도로 재평가해 병합하고, 신호 기반으로 대표를 재선정합니다.">
        <Button type="button" size="sm" variant="outline" disabled={isRunning(clusterJob.key)} onClick={() => startJob(clusterJob.key)}>
          관련기사 다시 묶기
        </Button>
      </JobCard>

      <JobCard
        job={youtubeTaggingJob}
        isRunning={isRunning(youtubeTaggingJob.key)}
        pending={pendingFor(youtubeTaggingJob.key)}
        help={<InfoHelp copy={YOUTUBE_TAGGING_HELP} />}
        description="크롤러가 분류 없이 적재한 기존 유튜브 콘텐츠에 뉴스와 동일한 해시태그·관련 엔티티를 붙입니다. 신규 수집분은 자동 태깅됩니다."
      >
        <Button type="button" size="sm" variant="outline" disabled={isRunning(youtubeTaggingJob.key)} onClick={() => startJob(youtubeTaggingJob.key)}>
          유튜브 태그 생성 실행
        </Button>
      </JobCard>

      <JobCard job={translateJob} isRunning={isRunning(translateJob.key)} pending={pendingFor(translateJob.key)} description="영문 유튜브 콘텐츠의 본문을 한글로 소급 번역합니다.">
        <Button type="button" size="sm" variant="outline" disabled={isRunning(translateJob.key)} onClick={() => startJob(translateJob.key)}>
          유튜브 영문 본문 번역 실행
        </Button>
      </JobCard>

      <Dialog open={isRangeOpen} onOpenChange={setIsRangeOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>본문 수집 기간</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              {ENRICH_RANGE_PRESETS.map((preset) => (
                <Button key={preset.label} type="button" size="sm" variant="outline" onClick={() => applyRangePreset(preset.days)}>
                  {preset.label}
                </Button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="enrich-from">시작일</Label>
                <Input id="enrich-from" type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="enrich-to">종료일</Label>
                <Input id="enrich-to" type="date" value={to} onChange={(event) => setTo(event.target.value)} />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">비워두면 전체 기간이 대상입니다.</p>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setIsRangeOpen(false)}>취소</Button>
            <Button type="button" onClick={startBodyBackfill}>채우기 시작</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
