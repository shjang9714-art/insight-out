'use client'

// 279 — /admin/insights의 AI 보강 잡(논조/위기·기회/유튜브 백필) +
// /admin/content-data의 백필 작업(AdminContentProcessing)을 한 콘솔로 통합.
// 신규 API 없음 — 기존 엔드포인트 그대로 재사용.

import { useState } from 'react'
import { Loader2, Wrench, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import AdminPageHeader from '@/components/admin/ui/AdminPageHeader'
import AdminSectionHeader from '@/components/admin/ui/AdminSectionHeader'
import AdminErrorBox from '@/components/admin/ui/AdminErrorBox'
import InfoHelp from '@/components/admin/ui/InfoHelp'
import AdminContentProcessing from '@/components/admin/AdminContentProcessing'
import {
  SENTIMENT_HELP,
  LGU_IMPACT_HELP,
  YOUTUBE_TAGGING_HELP,
  YOUTUBE_SUMMARY_HELP,
} from '@/lib/admin/help'

interface JobResult {
  analyzed: number
  candidates: number
  reason?: string
}

export default function AiJobsAdminPage() {
  const [error, setError] = useState<string | null>(null)

  const [isSentiment, setIsSentiment] = useState(false)
  const [sentimentResult, setSentimentResult] = useState<JobResult | null>(null)
  const [isLguImpact, setIsLguImpact] = useState(false)
  const [lguImpactResult, setLguImpactResult] = useState<JobResult | null>(null)
  const [isYoutubeTagging, setIsYoutubeTagging] = useState(false)
  const [youtubeTaggingResult, setYoutubeTaggingResult] = useState<JobResult | null>(null)
  const [isYoutubeSummary, setIsYoutubeSummary] = useState(false)
  const [youtubeSummaryResult, setYoutubeSummaryResult] = useState<JobResult | null>(null)

  const handleSentiment = async () => {
    if (!window.confirm('최근 14일 추적 기업·이슈 기사(최대 40건)의 논조를 LLM으로 분석하시겠습니까?')) return
    setIsSentiment(true)
    setSentimentResult(null)
    setError(null)
    try {
      const res = await fetch('/api/admin/sentiment', {
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

  const handleLguImpact = async () => {
    if (!window.confirm('최근 14일 경쟁사 기사(최대 40건)를 LG U+ 관점 위기·기회로 분석하시겠습니까?')) return
    setIsLguImpact(true)
    setLguImpactResult(null)
    setError(null)
    try {
      const res = await fetch('/api/admin/lgu-impact', {
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

  const handleYoutubeTagging = async () => {
    if (!window.confirm('기존 유튜브 콘텐츠(최대 100건)에 해시태그·관련 엔티티 태깅을 생성하시겠습니까?')) return
    setIsYoutubeTagging(true)
    setYoutubeTaggingResult(null)
    setError(null)
    try {
      const res = await fetch('/api/admin/youtube-tagging', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      const data = await res.json() as { analyzed?: number; candidates?: number; reason?: string; error?: string }
      if (!res.ok) throw new Error(data.error ?? '유튜브 태그 생성 실패')
      setYoutubeTaggingResult({ analyzed: data.analyzed ?? 0, candidates: data.candidates ?? 0, reason: data.reason })
    } catch (e) {
      setError(e instanceof Error ? e.message : '유튜브 태그 생성에 실패했습니다.')
    } finally {
      setIsYoutubeTagging(false)
    }
  }

  const handleYoutubeSummary = async () => {
    if (!window.confirm('요약 없는 유튜브 콘텐츠(최대 50건)에 제목·채널 기반 요약을 생성하시겠습니까? (LLM 호출)')) return
    setIsYoutubeSummary(true)
    setYoutubeSummaryResult(null)
    setError(null)
    try {
      const res = await fetch('/api/admin/youtube-summary', {
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

  return (
    <div className="space-y-10">
      <AdminPageHeader />

      {error && <AdminErrorBox>{error}</AdminErrorBox>}

      {/* AI 콘텐츠 보강 잡 (279 — /admin/insights 에서 이동) */}
      <div>
        <AdminSectionHeader icon={Sparkles} title="AI 콘텐츠 보강" hint="콘텐츠에 AI 분석 결과와 태그·요약 정보를 일괄 생성합니다." />
        <div className="space-y-4">
          {/* 논조 분석 패널 */}
          <div className="rounded-xl border border-border bg-card p-5 space-y-4">
            <div className="flex items-center gap-1.5">
              <h3 className="text-sm font-semibold text-foreground">논조 분석 (이슈·기업 기사)</h3>
              <InfoHelp copy={SENTIMENT_HELP} />
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              <Button onClick={() => void handleSentiment()} disabled={isSentiment} size="sm" variant="outline">
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

          {/* 위기·기회 분석 패널 */}
          <div className="rounded-xl border border-border bg-card p-5 space-y-4">
            <div className="flex items-center gap-1.5">
              <h3 className="text-sm font-semibold text-foreground">위기·기회 분석 (경쟁사 기사, LG U+ 관점)</h3>
              <InfoHelp copy={LGU_IMPACT_HELP} />
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              <Button onClick={() => void handleLguImpact()} disabled={isLguImpact} size="sm" variant="outline">
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

          {/* 기존 유튜브 태그 생성 패널 */}
          <div className="rounded-xl border border-border bg-card p-5 space-y-4">
            <div className="flex items-center gap-1.5">
              <h3 className="text-sm font-semibold text-foreground">기존 유튜브 태그 생성</h3>
              <InfoHelp copy={YOUTUBE_TAGGING_HELP} />
            </div>
            <p className="text-xs text-muted-foreground">
              크롤러가 분류 없이 적재한 기존 유튜브 콘텐츠에 뉴스와 동일한 해시태그·관련 엔티티를 붙입니다. 신규 수집분은 자동 태깅됩니다.
            </p>
            <div className="flex items-center gap-3 flex-wrap">
              <Button onClick={() => void handleYoutubeTagging()} disabled={isYoutubeTagging} size="sm" variant="outline">
                {isYoutubeTagging ? (
                  <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />생성 중...</>
                ) : (
                  <>유튜브 태그 생성 실행</>
                )}
              </Button>
            </div>
            {youtubeTaggingResult && (
              <p className="text-sm text-muted-foreground">
                {youtubeTaggingResult.reason
                  ? youtubeTaggingResult.reason
                  : `후보 ${youtubeTaggingResult.candidates}건 중 ${youtubeTaggingResult.analyzed}건 생성 완료`}
              </p>
            )}
          </div>

          {/* 유튜브 요약 생성 패널 */}
          <div className="rounded-xl border border-border bg-card p-5 space-y-4">
            <div className="flex items-center gap-1.5">
              <h3 className="text-sm font-semibold text-foreground">유튜브 요약 생성</h3>
              <InfoHelp copy={YOUTUBE_SUMMARY_HELP} />
            </div>
            <p className="text-xs text-muted-foreground">
              요약(주요 내용) 없는 유튜브에 제목·채널 기반 요약을 생성합니다. 신규 수집분은 수집 시 자동 생성됩니다.
            </p>
            <div className="flex items-center gap-3 flex-wrap">
              <Button onClick={() => void handleYoutubeSummary()} disabled={isYoutubeSummary} size="sm" variant="outline">
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
        </div>
      </div>

      {/* 데이터 보강·재처리 작업 (279 — /admin/content-data 에서 이동) */}
      <div>
        <AdminSectionHeader icon={Wrench} title="데이터 보강·재처리" hint="수집된 콘텐츠의 누락 데이터를 채우거나 기존 데이터를 다시 정리합니다." />
        <AdminContentProcessing />
      </div>
    </div>
  )
}
