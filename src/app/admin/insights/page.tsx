'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Sparkles, RefreshCw, Loader2, ExternalLink, CheckCircle2, Archive, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import type { InsightCard, InsightCardStatus } from '@/lib/types'
import AdminPageHeader from '@/components/admin/ui/AdminPageHeader'
import StatusBadge from '@/components/admin/ui/StatusBadge'
import AdminErrorBox from '@/components/admin/ui/AdminErrorBox'
import { INSIGHT_STATUS_TONE } from '@/lib/admin/status-style'

// ─── 상태 배지 ────────────────────────────────────────────────────────────────

const STATUS_LABEL: Record<InsightCardStatus, string> = {
  draft: '초안',
  published: '발행됨',
  archived: '보관',
}

// ─── 날짜 포맷 ────────────────────────────────────────────────────────────────

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '-'
  return new Date(dateStr).toLocaleDateString('ko-KR', {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

// ─── 컴포넌트 ─────────────────────────────────────────────────────────────────

export default function InsightsAdminPage() {
  const [cards, setCards] = useState<InsightCard[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isGenerating, setIsGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [generateDays, setGenerateDays] = useState('7')
  const [generateResult, setGenerateResult] = useState<{ created: number; topics: string[] } | null>(null)
  const [updatingId, setUpdatingId] = useState<string | null>(null)
  const [isSentiment, setIsSentiment] = useState(false)
  const [sentimentResult, setSentimentResult] = useState<{ analyzed: number; candidates: number; reason?: string } | null>(null)
  const [isLguImpact, setIsLguImpact] = useState(false)
  const [lguImpactResult, setLguImpactResult] = useState<{ analyzed: number; candidates: number; reason?: string } | null>(null)
  const [isYoutubeTagging, setIsYoutubeTagging] = useState(false)
  const [youtubeTaggingResult, setYoutubeTaggingResult] = useState<{ analyzed: number; candidates: number; reason?: string } | null>(null)
  const [isGeneratingCompany, setIsGeneratingCompany] = useState(false)
  const [companyResult, setCompanyResult] = useState<{ created: number; topics: string[] } | null>(null)
  const [isGeneratingCompetitorWeekly, setIsGeneratingCompetitorWeekly] = useState(false)
  const [competitorWeeklyResult, setCompetitorWeeklyResult] = useState<{ weekStart: string; weekEnd: string; status: string; sections: number; reason?: string } | null>(null)
  const [filterStatus, setFilterStatus] = useState<InsightCardStatus | 'all'>('all')

  async function fetchCards() {
    try {
      const res = await fetch('/api/admin/insights')
      const data = await res.json() as { cards?: InsightCard[]; error?: string }
      if (!res.ok) throw new Error(data.error ?? '목록 조회 실패')
      setCards(data.cards ?? [])
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : '불러오기 실패')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    const init = async () => { await fetchCards() }
    void init()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const refresh = () => {
    setIsLoading(true)
    void fetchCards()
  }

  const handleGenerate = async () => {
    if (!window.confirm(`최근 ${generateDays}일 콘텐츠로 AI 인사이트를 생성하시겠습니까?`)) return
    setIsGenerating(true)
    setGenerateResult(null)
    setError(null)
    try {
      const res = await fetch('/api/admin/insights', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ days: Number(generateDays) }),
      })
      const data = await res.json() as { created?: number; topics?: string[]; error?: string }
      if (!res.ok) throw new Error(data.error ?? '생성 실패')
      setGenerateResult({ created: data.created ?? 0, topics: data.topics ?? [] })
      await fetchCards()
    } catch (e) {
      setError(e instanceof Error ? e.message : '생성에 실패했습니다.')
    } finally {
      setIsGenerating(false)
    }
  }

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
    if (!window.confirm('기존 유튜브 콘텐츠(최대 100건)에 해시태그·관련 엔티티 태깅을 백필하시겠습니까?')) return
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
      if (!res.ok) throw new Error(data.error ?? '유튜브 태깅 백필 실패')
      setYoutubeTaggingResult({ analyzed: data.analyzed ?? 0, candidates: data.candidates ?? 0, reason: data.reason })
    } catch (e) {
      setError(e instanceof Error ? e.message : '유튜브 태깅 백필에 실패했습니다.')
    } finally {
      setIsYoutubeTagging(false)
    }
  }

  const handleGenerateCompany = async () => {
    if (!window.confirm('워치리스트 업체별 AI 동향 카드를 생성하시겠습니까? (LLM 호출)')) return
    setIsGeneratingCompany(true)
    setCompanyResult(null)
    setError(null)
    try {
      const res = await fetch('/api/admin/insights', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scope: 'company' }),
      })
      const data = await res.json() as { created?: number; topics?: string[]; error?: string }
      if (!res.ok) throw new Error(data.error ?? '생성 실패')
      setCompanyResult({ created: data.created ?? 0, topics: data.topics ?? [] })
      await fetchCards()
    } catch (e) {
      setError(e instanceof Error ? e.message : '관심업체 카드 생성에 실패했습니다.')
    } finally {
      setIsGeneratingCompany(false)
    }
  }

  const handleGenerateCompetitorWeekly = async () => {
    if (!window.confirm('최근 완결된 주(월~일)의 경쟁사 동향을 사업영역별로 종합한 주간 리포트를 생성하시겠습니까? (LLM 호출)')) return
    setIsGeneratingCompetitorWeekly(true)
    setCompetitorWeeklyResult(null)
    setError(null)
    try {
      const res = await fetch('/api/admin/competitor-weekly', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      const data = await res.json() as { weekStart?: string; weekEnd?: string; status?: string; sections?: number; reason?: string; error?: string }
      if (!res.ok) throw new Error(data.error ?? '생성 실패')
      setCompetitorWeeklyResult({
        weekStart: data.weekStart ?? '',
        weekEnd: data.weekEnd ?? '',
        status: data.status ?? 'draft',
        sections: data.sections ?? 0,
        reason: data.reason,
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : '주간 경쟁 리포트 생성에 실패했습니다.')
    } finally {
      setIsGeneratingCompetitorWeekly(false)
    }
  }

  const handleStatusChange = async (id: string, status: InsightCardStatus) => {
    setUpdatingId(id)
    try {
      const res = await fetch(`/api/admin/insights/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      if (!res.ok) {
        const data = await res.json() as { error?: string }
        throw new Error(data.error ?? '상태 변경 실패')
      }
      setCards(prev => prev.map(c => c.id === id ? { ...c, status } : c))
    } catch (e) {
      setError(e instanceof Error ? e.message : '상태 변경에 실패했습니다.')
    } finally {
      setUpdatingId(null)
    }
  }

  const handleDelete = async (id: string, topic: string) => {
    if (!window.confirm(`"${topic}" 카드를 삭제하시겠습니까?`)) return
    setUpdatingId(id)
    try {
      const res = await fetch(`/api/admin/insights/${id}`, { method: 'DELETE' })
      if (!res.ok) {
        const data = await res.json() as { error?: string }
        throw new Error(data.error ?? '삭제 실패')
      }
      setCards(prev => prev.filter(c => c.id !== id))
    } catch (e) {
      setError(e instanceof Error ? e.message : '삭제에 실패했습니다.')
    } finally {
      setUpdatingId(null)
    }
  }

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <AdminPageHeader
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={refresh}
            disabled={isLoading}
          >
            <RefreshCw className={cn('h-3.5 w-3.5 mr-1.5', isLoading && 'animate-spin')} />
            새로고침
          </Button>
        }
      />

      {/* 생성 패널 */}
      <div className="rounded-xl border border-border bg-card p-5 space-y-4">
        <h2 className="text-sm font-semibold text-foreground">인사이트 생성</h2>
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">기간</span>
            <Select value={generateDays} onValueChange={setGenerateDays} disabled={isGenerating}>
              <SelectTrigger className="h-8 w-28 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7">최근 7일</SelectItem>
                <SelectItem value="14">최근 14일</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button
            onClick={() => void handleGenerate()}
            disabled={isGenerating}
            size="sm"
            variant="brand"
          >
            {isGenerating ? (
              <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />생성 중...</>
            ) : (
              <><Sparkles className="h-3.5 w-3.5 mr-1.5" />지금 생성</>
            )}
          </Button>
        </div>
        {generateResult && (
          <p className="text-sm text-muted-foreground">
            {generateResult.created > 0
              ? `${generateResult.created}개 카드 생성됨: ${generateResult.topics.join(', ')}`
              : '생성된 카드 없음 (태깅 콘텐츠 부족 또는 LLM 키 미설정)'}
          </p>
        )}
      </div>

      {/* 관심업체 동향 생성 패널 */}
      <div className="rounded-xl border border-border bg-card p-5 space-y-4">
        <h2 className="text-sm font-semibold text-foreground">관심업체 동향 생성</h2>
        <div className="flex items-center gap-3 flex-wrap">
          <Button
            onClick={() => void handleGenerateCompany()}
            disabled={isGeneratingCompany}
            size="sm"
            variant="outline"
          >
            {isGeneratingCompany ? (
              <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />생성 중...</>
            ) : (
              <><Sparkles className="h-3.5 w-3.5 mr-1.5" />관심업체 카드 생성</>
            )}
          </Button>
        </div>
        {companyResult && (
          <p className="text-sm text-muted-foreground">
            {companyResult.created > 0
              ? `${companyResult.created}개 카드 생성됨: ${companyResult.topics.join(', ')}`
              : '생성된 카드 없음 (워치리스트 없음 또는 기사 부족)'}
          </p>
        )}
      </div>

      {/* 주간 경쟁 리포트 생성 패널 (261) */}
      <div className="rounded-xl border border-border bg-card p-5 space-y-4">
        <h2 className="text-sm font-semibold text-foreground">주간 경쟁 리포트 생성</h2>
        <p className="text-xs text-muted-foreground">
          경쟁사(통신 3사 중심) 기사를 사업영역별(AIDC·AICC·통신B2B·보안·클라우드·IT 등)로 종합해 위기·기회를 판정합니다. 기본은 최근 완결된 주(월~일).
        </p>
        <div className="flex items-center gap-3 flex-wrap">
          <Button
            onClick={() => void handleGenerateCompetitorWeekly()}
            disabled={isGeneratingCompetitorWeekly}
            size="sm"
            variant="outline"
          >
            {isGeneratingCompetitorWeekly ? (
              <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />생성 중...</>
            ) : (
              <><Sparkles className="h-3.5 w-3.5 mr-1.5" />주간 경쟁 리포트 생성</>
            )}
          </Button>
        </div>
        {competitorWeeklyResult && (
          <p className="text-sm text-muted-foreground">
            {competitorWeeklyResult.status === 'published'
              ? `${competitorWeeklyResult.weekStart} ~ ${competitorWeeklyResult.weekEnd} 발행됨 (사업영역 ${competitorWeeklyResult.sections}개)`
              : competitorWeeklyResult.reason ?? '생성된 리포트 없음'}
          </p>
        )}
      </div>

      {/* 논조 분석 패널 */}
      <div className="rounded-xl border border-border bg-card p-5 space-y-4">
        <h2 className="text-sm font-semibold text-foreground">논조 분석 (이슈·기업 기사)</h2>
        <div className="flex items-center gap-3 flex-wrap">
          <Button
            onClick={() => void handleSentiment()}
            disabled={isSentiment}
            size="sm"
            variant="outline"
          >
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
        <h2 className="text-sm font-semibold text-foreground">위기·기회 분석 (경쟁사 기사, LG U+ 관점)</h2>
        <div className="flex items-center gap-3 flex-wrap">
          <Button
            onClick={() => void handleLguImpact()}
            disabled={isLguImpact}
            size="sm"
            variant="outline"
          >
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

      {/* 유튜브 태깅 백필 패널 (252) */}
      <div className="rounded-xl border border-border bg-card p-5 space-y-4">
        <h2 className="text-sm font-semibold text-foreground">유튜브 해시태그·엔티티 백필</h2>
        <p className="text-xs text-muted-foreground">
          크롤러가 분류 없이 적재한 기존 유튜브 콘텐츠에 뉴스와 동일한 해시태그·관련 엔티티를 붙입니다. 신규 수집분은 자동 태깅됩니다.
        </p>
        <div className="flex items-center gap-3 flex-wrap">
          <Button
            onClick={() => void handleYoutubeTagging()}
            disabled={isYoutubeTagging}
            size="sm"
            variant="outline"
          >
            {isYoutubeTagging ? (
              <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />백필 중...</>
            ) : (
              <>유튜브 태깅 백필 실행</>
            )}
          </Button>
        </div>
        {youtubeTaggingResult && (
          <p className="text-sm text-muted-foreground">
            {youtubeTaggingResult.reason
              ? youtubeTaggingResult.reason
              : `후보 ${youtubeTaggingResult.candidates}건 중 ${youtubeTaggingResult.analyzed}건 백필 완료`}
          </p>
        )}
      </div>

      {/* 에러 */}
      {error && (
        <AdminErrorBox>{error}</AdminErrorBox>
      )}

      {/* 카드 목록 */}
      {!isLoading && cards.length > 0 && (() => {
        const draftCount = cards.filter(c => c.status === 'draft').length
        const statusCounts: Record<string, number> = {}
        for (const c of cards) statusCounts[c.status] = (statusCounts[c.status] ?? 0) + 1
        return (
          <div className="space-y-3">
            {draftCount > 0 && (
              <div className="rounded-lg border border-yellow-200 bg-yellow-50 px-4 py-2.5 flex items-center justify-between">
                <p className="text-sm font-medium text-yellow-800">
                  검토 대기 <span className="tabular-nums">{draftCount}</span>건
                </p>
                <button
                  onClick={() => setFilterStatus(filterStatus === 'draft' ? 'all' : 'draft')}
                  className={cn(
                    'text-xs font-medium px-2.5 py-1 rounded-full border transition-colors',
                    filterStatus === 'draft'
                      ? 'border-yellow-600 bg-yellow-600 text-white'
                      : 'border-yellow-400 text-yellow-700 hover:bg-yellow-100'
                  )}
                >
                  {filterStatus === 'draft' ? '전체 보기' : '초안만 보기'}
                </button>
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              {(['all', 'draft', 'published', 'archived'] as const).map(s => {
                const count = s === 'all' ? cards.length : (statusCounts[s] ?? 0)
                return (
                  <button
                    key={s}
                    onClick={() => setFilterStatus(s)}
                    className={cn(
                      'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                      filterStatus === s
                        ? 'border-foreground bg-foreground text-background'
                        : 'border-border text-muted-foreground hover:border-foreground hover:text-foreground'
                    )}
                  >
                    {s === 'all' ? '전체' : STATUS_LABEL[s]}
                    <span className="ml-1.5 tabular-nums opacity-70">{count}</span>
                  </button>
                )
              })}
            </div>
          </div>
        )
      })()}

      {isLoading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin mr-2" />
          불러오는 중...
        </div>
      ) : cards.length === 0 ? (
        <div className="rounded-lg border border-dashed p-10 text-center text-muted-foreground">
          아직 생성된 인사이트 카드가 없습니다.
        </div>
      ) : (() => {
        const visibleCards = filterStatus === 'all' ? cards : cards.filter(c => c.status === filterStatus)
        return (
        <div className="space-y-3">
          {visibleCards.map((card) => (
            <div
              key={card.id}
              className="rounded-xl border border-border bg-card p-5 space-y-3"
            >
              {/* 카드 헤더 */}
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-medium text-brand-600 bg-brand-600/10 rounded px-1.5 py-0.5">
                      {card.topic}
                    </span>
                    <span className={cn(
                      'text-xs rounded px-1.5 py-0.5 font-medium',
                      card.scope === 'company'
                        ? 'bg-violet-100 text-violet-700'
                        : 'bg-sky-100 text-sky-700'
                    )}>
                      {card.scope === 'company' ? '관심업체' : '산업'}
                    </span>
                    <StatusBadge tone={INSIGHT_STATUS_TONE[card.status]} label={STATUS_LABEL[card.status]} className="rounded" />
                    <span className="text-xs text-muted-foreground">
                      {card.period_start} ~ {card.period_end}
                    </span>
                  </div>
                  <p className="text-sm font-semibold text-foreground leading-snug">
                    {card.headline}
                  </p>
                </div>
                {/* 액션 버튼 */}
                <div className="flex items-center gap-1 shrink-0">
                  {card.status !== 'published' && (
                    <button
                      onClick={() => void handleStatusChange(card.id, 'published')}
                      disabled={updatingId === card.id}
                      className="rounded p-1.5 text-muted-foreground hover:bg-positive-soft hover:text-positive transition-colors disabled:opacity-40"
                      title="발행"
                    >
                      {updatingId === card.id
                        ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        : <CheckCircle2 className="h-3.5 w-3.5" />
                      }
                    </button>
                  )}
                  {card.status === 'published' && (
                    <button
                      onClick={() => void handleStatusChange(card.id, 'draft')}
                      disabled={updatingId === card.id}
                      className="rounded p-1.5 text-muted-foreground hover:bg-yellow-50 hover:text-yellow-700 transition-colors disabled:opacity-40"
                      title="초안으로"
                    >
                      {updatingId === card.id
                        ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        : <Archive className="h-3.5 w-3.5" />
                      }
                    </button>
                  )}
                  <button
                    onClick={() => void handleDelete(card.id, card.topic)}
                    disabled={updatingId === card.id}
                    className="rounded p-1.5 text-muted-foreground/40 hover:bg-destructive/10 hover:text-destructive transition-colors disabled:opacity-40"
                    title="삭제"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              {/* 시사점 */}
              {card.implication && (
                <p className="text-xs text-muted-foreground leading-relaxed border-l-2 border-brand-600/30 pl-3">
                  {card.implication}
                </p>
              )}

              {/* 출처 + 인용 */}
              <div className="space-y-1.5">
                <p className="text-[11px] font-medium text-muted-foreground/70 uppercase tracking-wide">
                  출처 {card.source_content_ids.length}건 · 인용 {card.citations.length}건 · 생성 {formatDate(card.generated_at)}
                </p>
                {card.citations.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {card.citations.slice(0, 5).map((c, i) => (
                      <Link
                        key={i}
                        href={`/dashboard/contents/${c.content_id}`}
                        target="_blank"
                        className="inline-flex items-center gap-1 rounded bg-accent px-2 py-0.5 text-[11px] text-muted-foreground hover:text-foreground transition-colors max-w-[220px] truncate"
                        title={c.quote}
                      >
                        <ExternalLink className="h-2.5 w-2.5 shrink-0" />
                        <span className="truncate">{c.quote}</span>
                      </Link>
                    ))}
                    {card.citations.length > 5 && (
                      <span className="text-[11px] text-muted-foreground">
                        +{card.citations.length - 5}개
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
        )
      })()}
    </div>
  )
}
