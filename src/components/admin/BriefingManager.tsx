'use client'

import { useEffect, useState } from 'react'
import { AlertCircle, ChevronDown, ChevronUp, Loader2, Sparkles, Volume2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import StatusBadge from '@/components/admin/ui/StatusBadge'
import { BRIEFING_STATUS_TONE } from '@/lib/admin/status-style'

type BriefingStatus = 'draft' | 'published' | 'archived' | 'failed'

interface Briefing {
  id: string
  briefing_date: string
  title: string | null
  script: string | null
  audio_url: string | null
  audio_duration_seconds: number | null
  voice: string | null
  status: BriefingStatus
  generated_at: string | null
  published_at: string | null
  updated_at: string | null
  highlights: { content_id: string; insight: string }[] | null
}

interface BriefingsResponse {
  period: string
  tts: { used: number; cap: number }
  briefings: Briefing[]
  error?: string
}

type PendingAction = 'tts' | 'approve' | 'archive' | 'revert' | 'highlights'

const STATUS_LABELS: Record<BriefingStatus, string> = {
  draft: '초안',
  published: '공개',
  archived: '보관',
  failed: '실패',
}

const NUMBER_FORMATTER = new Intl.NumberFormat('ko-KR')
const DATE_FORMATTER = new Intl.DateTimeFormat('ko-KR', {
  year: 'numeric',
  month: 'long',
  day: 'numeric',
  weekday: 'short',
})

export default function BriefingManager() {
  const [period, setPeriod] = useState('')
  const [tts, setTts] = useState({ used: 0, cap: 3_500_000 })
  const [briefings, setBriefings] = useState<Briefing[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null)
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({})

  useEffect(() => {
    let isActive = true

    async function loadBriefings() {
      try {
        const response = await fetch('/api/admin/briefings', { cache: 'no-store' })
        const data = (await response.json()) as BriefingsResponse

        if (!response.ok) {
          throw new Error(data.error ?? '브리핑 목록을 불러오지 못했습니다.')
        }

        if (isActive) {
          setPeriod(data.period)
          setTts(data.tts)
          setBriefings(data.briefings)
        }
      } catch (loadError) {
        if (isActive) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : '브리핑 목록을 불러오지 못했습니다.'
          )
        }
      } finally {
        if (isActive) setIsLoading(false)
      }
    }

    void loadBriefings()
    return () => { isActive = false }
  }, [])

  function toggleExpanded(id: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function clearRowError(id: string) {
    setRowErrors((prev) => {
      const next = { ...prev }
      delete next[id]
      return next
    })
  }

  async function generateAudio(briefing: Briefing) {
    setPendingId(briefing.id)
    setPendingAction('tts')
    clearRowError(briefing.id)

    try {
      const response = await fetch(`/api/admin/briefings/${briefing.id}/tts`, {
        method: 'POST',
      })
      const data = (await response.json()) as { ok: boolean; audioUrl?: string; reason?: string; error?: string }

      if (!response.ok || !data.ok) {
        const reason = data.reason ?? data.error ?? 'TTS 생성 중 오류가 발생했습니다.'
        setRowErrors((prev) => ({ ...prev, [briefing.id]: reason }))
        return
      }

      setBriefings((current) =>
        current.map((b) =>
          b.id === briefing.id ? { ...b, audio_url: data.audioUrl ?? b.audio_url } : b
        )
      )
    } catch {
      setRowErrors((prev) => ({ ...prev, [briefing.id]: 'TTS 요청 중 네트워크 오류가 발생했습니다.' }))
    } finally {
      setPendingId(null)
      setPendingAction(null)
    }
  }

  async function generateHighlights(briefing: Briefing) {
    setPendingId(briefing.id)
    setPendingAction('highlights')
    clearRowError(briefing.id)

    try {
      const response = await fetch(`/api/admin/briefings/${briefing.id}/highlights`, {
        method: 'POST',
      })
      const data = (await response.json()) as {
        ok: boolean
        highlights?: { content_id: string; insight: string }[]
        reason?: string
        error?: string
      }

      if (!response.ok || !data.ok) {
        const reason = data.reason ?? data.error ?? '인사이트 생성 중 오류가 발생했습니다.'
        setRowErrors((prev) => ({ ...prev, [briefing.id]: reason }))
        return
      }

      setBriefings((current) =>
        current.map((b) =>
          b.id === briefing.id ? { ...b, highlights: data.highlights ?? b.highlights } : b
        )
      )
    } catch {
      setRowErrors((prev) => ({ ...prev, [briefing.id]: '인사이트 요청 중 네트워크 오류가 발생했습니다.' }))
    } finally {
      setPendingId(null)
      setPendingAction(null)
    }
  }

  async function changeStatus(briefing: Briefing, nextStatus: 'published' | 'archived' | 'draft') {
    const action: PendingAction =
      nextStatus === 'published' ? 'approve' :
      nextStatus === 'archived' ? 'archive' : 'revert'

    if (nextStatus === 'published' && !briefing.audio_url) {
      const confirmed = window.confirm('오디오 없이 공개하면 스크립트만 재생됩니다. 공개할까요?')
      if (!confirmed) return
    }

    setPendingId(briefing.id)
    setPendingAction(action)
    clearRowError(briefing.id)

    try {
      const response = await fetch(`/api/admin/briefings/${briefing.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: nextStatus }),
      })
      const data = (await response.json()) as { ok?: boolean; status?: string; error?: string }

      if (!response.ok) {
        setRowErrors((prev) => ({ ...prev, [briefing.id]: data.error ?? '상태 변경에 실패했습니다.' }))
        return
      }

      setBriefings((current) =>
        current.map((b) =>
          b.id === briefing.id ? { ...b, status: nextStatus } : b
        )
      )
    } catch {
      setRowErrors((prev) => ({ ...prev, [briefing.id]: '상태 변경 중 네트워크 오류가 발생했습니다.' }))
    } finally {
      setPendingId(null)
      setPendingAction(null)
    }
  }

  if (isLoading) {
    return (
      <div className="flex min-h-40 items-center justify-center rounded-xl border border-border bg-card">
        <Loader2 className="h-5 w-5 animate-spin text-brand-600" />
        <span className="ml-2 text-sm text-muted-foreground">브리핑 목록을 불러오는 중입니다.</span>
      </div>
    )
  }

  const ttsPercentage = Math.min((tts.used / tts.cap) * 100, 100)

  return (
    <div className="space-y-4">
      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {/* TTS 사용량 카드 */}
      <div className="rounded-xl border border-border bg-card px-5 py-4">
        <p className="text-sm font-medium text-foreground">
          {period ? `${period} TTS 사용량` : '이번 달 TTS 사용량'}
        </p>
        <div className="mt-3">
          <div className="mb-2 flex items-center justify-between text-xs">
            <span className="text-muted-foreground">
              {NUMBER_FORMATTER.format(tts.used)} / {NUMBER_FORMATTER.format(tts.cap)}자
            </span>
            <span className="font-medium text-foreground">
              {ttsPercentage.toFixed(1)}% · 잔여 {NUMBER_FORMATTER.format(Math.max(0, tts.cap - tts.used))}자
            </span>
          </div>
          <Progress
            value={ttsPercentage}
            aria-label="이번 달 TTS 사용량"
            className="h-2"
          />
        </div>
      </div>

      {/* 브리핑 목록 */}
      {briefings.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
          관리할 브리핑이 없습니다. (#47 스크립트 생성 후 표시됩니다)
        </div>
      ) : (
        <div className="space-y-3">
          {briefings.map((briefing) => {
            const isExpanded = expandedIds.has(briefing.id)
            const isRowPending = pendingId === briefing.id
            const rowError = rowErrors[briefing.id]

            return (
              <div
                key={briefing.id}
                className="rounded-xl border border-border bg-card"
              >
                {/* 헤더 */}
                <div className="flex flex-wrap items-start gap-3 px-5 py-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium text-muted-foreground">
                        {DATE_FORMATTER.format(new Date(briefing.briefing_date))}
                      </span>
                      <StatusBadge tone={BRIEFING_STATUS_TONE[briefing.status]} label={STATUS_LABELS[briefing.status]} />
                    </div>
                    <p className="mt-1 font-semibold text-foreground line-clamp-1">
                      {briefing.title ?? '제목 없음'}
                    </p>
                  </div>

                  {/* 액션 버튼 */}
                  <div className="flex flex-wrap items-center gap-2">
                    {/* 오디오 생성/재생성 */}
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={isRowPending}
                      onClick={() => void generateAudio(briefing)}
                    >
                      {isRowPending && pendingAction === 'tts' ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Volume2 className="h-3.5 w-3.5" />
                      )}
                      {briefing.audio_url ? '재생성' : '오디오 생성'}
                    </Button>

                    {/* 홈 카드용 핵심 인사이트 3줄 생성/재생성 */}
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={isRowPending}
                      onClick={() => void generateHighlights(briefing)}
                    >
                      {isRowPending && pendingAction === 'highlights' ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Sparkles className="h-3.5 w-3.5" />
                      )}
                      {briefing.highlights && briefing.highlights.length > 0 ? '인사이트 재생성' : '인사이트 생성'}
                    </Button>

                    {/* 승인(공개) — draft 상태일 때 */}
                    {briefing.status === 'draft' && (
                      <Button
                        type="button"
                        size="sm"
                        disabled={isRowPending}
                        onClick={() => void changeStatus(briefing, 'published')}
                      >
                        {isRowPending && pendingAction === 'approve' && (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        )}
                        승인(공개)
                      </Button>
                    )}

                    {/* 보관 + 공개 취소 — published 상태일 때 */}
                    {briefing.status === 'published' && (
                      <>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={isRowPending}
                          onClick={() => void changeStatus(briefing, 'draft')}
                        >
                          {isRowPending && pendingAction === 'revert' && (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          )}
                          공개 취소
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={isRowPending}
                          onClick={() => void changeStatus(briefing, 'archived')}
                        >
                          {isRowPending && pendingAction === 'archive' && (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          )}
                          보관
                        </Button>
                      </>
                    )}

                    {/* 재공개 — archived 상태일 때 */}
                    {briefing.status === 'archived' && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={isRowPending}
                        onClick={() => void changeStatus(briefing, 'published')}
                      >
                        {isRowPending && pendingAction === 'approve' && (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        )}
                        재공개
                      </Button>
                    )}
                  </div>
                </div>

                {/* 행 단위 에러 */}
                {rowError && (
                  <div className="mx-5 mb-3 flex items-center gap-2 rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-700">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    {rowError}
                  </div>
                )}

                {/* 오디오 미리듣기 */}
                {briefing.audio_url && (
                  <div className="border-t border-border px-5 py-3">
                    <audio controls src={briefing.audio_url} className="w-full h-8" />
                  </div>
                )}
                {!briefing.audio_url && (
                  <div className="border-t border-border px-5 py-3">
                    <p className="text-xs text-muted-foreground">오디오 없음</p>
                  </div>
                )}

                {/* 스크립트 미리보기 접힘/펼침 */}
                <div className="border-t border-border">
                  <button
                    type="button"
                    onClick={() => toggleExpanded(briefing.id)}
                    className="flex w-full items-center justify-between px-5 py-3 text-sm text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <span>스크립트 {isExpanded ? '접기' : '펼쳐보기'}</span>
                    {isExpanded ? (
                      <ChevronUp className="h-4 w-4" />
                    ) : (
                      <ChevronDown className="h-4 w-4" />
                    )}
                  </button>
                  {isExpanded && (
                    <div className="px-5 pb-5">
                      {briefing.script ? (
                        <div className="max-h-60 overflow-y-auto rounded-lg bg-muted px-4 py-3 text-sm text-foreground leading-relaxed whitespace-pre-wrap">
                          {briefing.script}
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground">스크립트 없음</p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
