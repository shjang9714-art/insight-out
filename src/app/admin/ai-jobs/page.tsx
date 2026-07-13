'use client'

import { useRef, useState } from 'react'
import { Loader2, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import AdminPageHeader from '@/components/admin/ui/AdminPageHeader'
import AdminSectionHeader from '@/components/admin/ui/AdminSectionHeader'
import AdminErrorBox from '@/components/admin/ui/AdminErrorBox'
import InfoHelp from '@/components/admin/ui/InfoHelp'
import {
  LGU_IMPACT_HELP,
  SENTIMENT_HELP,
  YOUTUBE_SUMMARY_HELP,
} from '@/lib/admin/help'
import { getEnrichJobs, type EnrichJobMeta } from '@/lib/admin/enrich-jobs'

interface JobResult {
  analyzed: number
  candidates: number
  reason?: string
}

const AI_JOBS = getEnrichJobs('ai')

export default function AiJobsAdminPage() {
  const [error, setError] = useState<string | null>(null)

  const [isSentiment, setIsSentiment] = useState(false)
  const [sentimentResult, setSentimentResult] = useState<JobResult | null>(null)
  const [isLguImpact, setIsLguImpact] = useState(false)
  const [lguImpactResult, setLguImpactResult] = useState<JobResult | null>(null)
  const [isYoutubeSummary, setIsYoutubeSummary] = useState(false)
  const [youtubeSummaryResult, setYoutubeSummaryResult] = useState<JobResult | null>(null)

  const [isSummarizing, setIsSummarizing] = useState(false)
  const [summaryResult, setSummaryResult] = useState<string | null>(null)
  const summaryStopRef = useRef(false)

  const [isSignalling, setIsSignalling] = useState(false)
  const [signalResult, setSignalResult] = useState<string | null>(null)
  const signalStopRef = useRef(false)

  const handleSentiment = async (job: EnrichJobMeta) => {
    if (!window.confirm('최근 14일 추적 기업·이슈 기사(최대 40건)의 논조를 LLM으로 분석하시겠습니까?')) return
    setIsSentiment(true)
    setSentimentResult(null)
    setError(null)
    try {
      const res = await fetch(job.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      const data = await res.json() as { analyzed?: number; candidates?: number; reason?: string; error?: string }
      if (!res.ok) throw new Error(data.error ?? '논조 분석 실패')
      setSentimentResult({ analyzed: data.analyzed ?? 0, candidates: data.candidates ?? 0, reason: data.reason })
    } catch (e) {
      setError(e instanceof Error ? e.message : '논조 분석에 실패했습니다.')
    } finally {
      setIsSentiment(false)
    }
  }

  const handleLguImpact = async (job: EnrichJobMeta) => {
    if (!window.confirm('최근 14일 경쟁사 기사(최대 40건)를 LG U+ 관점 위기·기회로 분석하시겠습니까?')) return
    setIsLguImpact(true)
    setLguImpactResult(null)
    setError(null)
    try {
      const res = await fetch(job.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      const data = await res.json() as { analyzed?: number; candidates?: number; reason?: string; error?: string }
      if (!res.ok) throw new Error(data.error ?? '위기·기회 분석 실패')
      setLguImpactResult({ analyzed: data.analyzed ?? 0, candidates: data.candidates ?? 0, reason: data.reason })
    } catch (e) {
      setError(e instanceof Error ? e.message : '위기·기회 분석에 실패했습니다.')
    } finally {
      setIsLguImpact(false)
    }
  }

  const handleYoutubeSummary = async (job: EnrichJobMeta) => {
    if (!window.confirm('요약 없는 유튜브 콘텐츠(최대 50건)에 제목·채널 기반 요약을 생성하시겠습니까? (LLM 호출)')) return
    setIsYoutubeSummary(true)
    setYoutubeSummaryResult(null)
    setError(null)
    try {
      const res = await fetch(job.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      const data = await res.json() as { analyzed?: number; candidates?: number; reason?: string; error?: string }
      if (!res.ok) throw new Error(data.error ?? '유튜브 요약 생성 실패')
      setYoutubeSummaryResult({ analyzed: data.analyzed ?? 0, candidates: data.candidates ?? 0, reason: data.reason })
    } catch (e) {
      setError(e instanceof Error ? e.message : '유튜브 요약 생성에 실패했습니다.')
    } finally {
      setIsYoutubeSummary(false)
    }
  }

  const handleSummaryBackfill = async (job: EnrichJobMeta) => {
    summaryStopRef.current = false
    setIsSummarizing(true)
    setSummaryResult(null)
    setError(null)
    const acc = { processed: 0, filled: 0, notReady: 0 }
    try {
      while (true) {
        const res = await fetch(`${job.endpoint}?limit=20`, { method: 'POST' })
        if (!res.ok) throw new Error((await res.json() as { error?: string }).error ?? '뉴스 요약 백필 실패')
        const { processed, filled, notReady, remaining, rateLimited } = await res.json() as {
          processed: number; filled: number; notReady: number; remaining: number; rateLimited?: boolean
        }
        acc.processed += processed
        acc.filled    += filled
        acc.notReady  += notReady

        if (rateLimited) {
          setSummaryResult(`LLM 한도 소진 — 중단됨. 내일 다시 시도됩니다. · 누적 처리 ${acc.processed} · 요약 ${acc.filled} · 남은 ${remaining.toLocaleString()}`)
          break
        }
        if (summaryStopRef.current) {
          setSummaryResult(`중단됨 · 누적 처리 ${acc.processed} · 요약 ${acc.filled} · 남은 ${remaining.toLocaleString()}`)
          break
        }
        if (remaining === 0) {
          setSummaryResult(`완료 · 처리 ${acc.processed} · 요약 ${acc.filled} · 준비안됨 ${acc.notReady}`)
          break
        }
        if (processed === 0) break

        setSummaryResult(`요약 중… 누적 처리 ${acc.processed} · 요약 ${acc.filled} · 준비안됨 ${acc.notReady} · 남은 ${remaining.toLocaleString()}`)
        await new Promise((r) => setTimeout(r, 300))
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '뉴스 요약 백필 중 오류가 발생했습니다.')
    } finally {
      setIsSummarizing(false)
    }
  }

  const handleSignalClassify = async (job: EnrichJobMeta) => {
    signalStopRef.current = false
    setIsSignalling(true)
    setSignalResult(null)
    setError(null)
    const acc = { processed: 0, tagged: 0 }
    try {
      while (true) {
        const res = await fetch(`${job.endpoint}?limit=10`, { method: 'POST' })
        if (!res.ok) throw new Error((await res.json() as { error?: string }).error ?? '신호 분류 실패')
        const { processed, tagged, remaining } = await res.json() as { processed: number; tagged: number; remaining: number }
        acc.processed += processed
        acc.tagged += tagged
        if (signalStopRef.current) {
          setSignalResult(`중단됨 · 누적 처리 ${acc.processed} · 신호 ${acc.tagged} · 남은 ${remaining.toLocaleString()}`)
          break
        }
        if (remaining === 0) {
          setSignalResult(`완료 · 처리 ${acc.processed} · 신호 ${acc.tagged}`)
          break
        }
        if (processed === 0) break
        setSignalResult(`분류 중… 누적 처리 ${acc.processed} · 신호 ${acc.tagged} · 남은 ${remaining.toLocaleString()}`)
        await new Promise((r) => setTimeout(r, 300))
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '신호 분류 중 오류가 발생했습니다.')
    } finally {
      setIsSignalling(false)
    }
  }

  const renderJob = (job: EnrichJobMeta) => {
    switch (job.key) {
      case 'admin:sentiment':
        return (
          <div key={job.key} className="rounded-xl border border-border bg-card p-5 space-y-4">
            <div className="flex items-center gap-1.5">
              <h3 className="text-sm font-semibold text-foreground">{job.label} (이슈·기업 기사)</h3>
              <InfoHelp copy={SENTIMENT_HELP} />
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              <Button onClick={() => void handleSentiment(job)} disabled={isSentiment} size="sm" variant="outline">
                {isSentiment ? (
                  <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />분석 중...</>
                ) : (
                  <>논조 분석 실행</>
                )}
              </Button>
            </div>
            {sentimentResult && (
              <p className="text-sm text-muted-foreground">
                {sentimentResult.reason
                  ? sentimentResult.reason
                  : `후보 ${sentimentResult.candidates}건 중 ${sentimentResult.analyzed}건 분석 완료`}
              </p>
            )}
          </div>
        )

      case 'admin:lgu-impact':
        return (
          <div key={job.key} className="rounded-xl border border-border bg-card p-5 space-y-4">
            <div className="flex items-center gap-1.5">
              <h3 className="text-sm font-semibold text-foreground">{job.label} (경쟁사 기사, LG U+ 관점)</h3>
              <InfoHelp copy={LGU_IMPACT_HELP} />
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              <Button onClick={() => void handleLguImpact(job)} disabled={isLguImpact} size="sm" variant="outline">
                {isLguImpact ? (
                  <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />분석 중...</>
                ) : (
                  <>위기·기회 분석 실행</>
                )}
              </Button>
            </div>
            {lguImpactResult && (
              <p className="text-sm text-muted-foreground">
                {lguImpactResult.reason
                  ? lguImpactResult.reason
                  : `후보 ${lguImpactResult.candidates}건 중 ${lguImpactResult.analyzed}건 분석 완료`}
              </p>
            )}
          </div>
        )

      case 'admin:youtube-summary':
        return (
          <div key={job.key} className="rounded-xl border border-border bg-card p-5 space-y-4">
            <div className="flex items-center gap-1.5">
              <h3 className="text-sm font-semibold text-foreground">{job.label}</h3>
              <InfoHelp copy={YOUTUBE_SUMMARY_HELP} />
            </div>
            <p className="text-xs text-muted-foreground">
              요약(주요 내용) 없는 유튜브에 제목·채널 기반 요약을 생성합니다. 신규 수집분은 수집 시 자동 생성됩니다.
            </p>
            <div className="flex items-center gap-3 flex-wrap">
              <Button onClick={() => void handleYoutubeSummary(job)} disabled={isYoutubeSummary} size="sm" variant="outline">
                {isYoutubeSummary ? (
                  <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />생성 중...</>
                ) : (
                  <>유튜브 요약 생성 실행</>
                )}
              </Button>
            </div>
            {youtubeSummaryResult && (
              <p className="text-sm text-muted-foreground">
                {youtubeSummaryResult.reason
                  ? youtubeSummaryResult.reason
                  : `후보 ${youtubeSummaryResult.candidates}건 중 ${youtubeSummaryResult.analyzed}건 생성 완료`}
              </p>
            )}
          </div>
        )

      case 'admin:summary-backfill':
        return (
          <div key={job.key} className="rounded-xl border border-border bg-card p-5 space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="admin-card-title text-foreground">{job.label}</p>
                <p className="admin-caption mt-1 max-w-lg text-muted-foreground">
                  요약이 없는 발행 콘텐츠를 LLM으로 요약합니다. 매일 05:20 크론이 돌지만,
                  지금 바로 채워서 확인하려면 이 버튼을 누르세요.
                </p>
                {summaryResult && (
                  <p className="admin-caption mt-2 text-positive">
                    {isSummarizing ? <Loader2 className="mr-1 inline h-3 w-3 animate-spin" /> : '✅ '}{summaryResult}
                  </p>
                )}
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="shrink-0"
                onClick={isSummarizing ? () => { summaryStopRef.current = true } : () => void handleSummaryBackfill(job)}
              >
                {isSummarizing ? '중단' : '뉴스 요약 백필'}
              </Button>
            </div>
          </div>
        )

      case 'admin:signals-backfill':
        return (
          <div key={job.key} className="rounded-xl border border-border bg-card p-5 space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="admin-card-title text-foreground">{job.label}</p>
                <p className="admin-caption mt-1 max-w-lg text-muted-foreground">
                  기사를 이벤트 유형(투자·M&amp;A·규제·신제품 등)으로 자동 태깅합니다.
                </p>
                {signalResult && (
                  <p className="admin-caption mt-2 text-positive">
                    {isSignalling ? <Loader2 className="mr-1 inline h-3 w-3 animate-spin" /> : '✅ '}{signalResult}
                  </p>
                )}
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="shrink-0"
                onClick={isSignalling ? () => { signalStopRef.current = true } : () => void handleSignalClassify(job)}
              >
                {isSignalling ? '중단' : '신호 분류'}
              </Button>
            </div>
          </div>
        )

      default:
        throw new Error(`[ai-jobs] ${job.key} 작업 렌더러가 없습니다.`)
    }
  }

  return (
    <div className="space-y-10">
      <AdminPageHeader />

      {error && <AdminErrorBox>{error}</AdminErrorBox>}

      <div>
        <AdminSectionHeader icon={Sparkles} title="AI 콘텐츠 보강" hint="LLM을 사용하는 콘텐츠 분석·요약 작업만 실행합니다." />
        <div className="space-y-4">
          {AI_JOBS.map(renderJob)}
        </div>
      </div>
    </div>
  )
}
