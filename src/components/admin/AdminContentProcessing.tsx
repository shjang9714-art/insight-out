'use client'

import { useRef, useState } from 'react'
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

// 207 — 풀본문 채우기 기간 팝업 프리셋
const ENRICH_RANGE_PRESETS: { label: string; days: number | null }[] = [
  { label: '최근 7일',  days: 7 },
  { label: '최근 30일', days: 30 },
  { label: '최근 90일', days: 90 },
  { label: '전체',      days: null },
]

export default function AdminContentProcessing() {
  const [error, setError] = useState<string | null>(null)

  // 풀본문 채우기
  const [isEnriching,      setIsEnriching]      = useState(false)
  const [enrichResult,     setEnrichResult]     = useState<string | null>(null)
  const [isEnrichRangeOpen, setIsEnrichRangeOpen] = useState(false)
  const [enrichFrom,       setEnrichFrom]       = useState('')
  const [enrichTo,         setEnrichTo]         = useState('')
  const stopRef = useRef(false)

  // 신호 분류
  const [isSignalling,  setIsSignalling]  = useState(false)
  const [signalResult,  setSignalResult]  = useState<string | null>(null)
  const signalStopRef = useRef(false)

  // 원문 URL 정규화
  const [isCanonicalizing,  setIsCanonicalizing]  = useState(false)
  const [canonicalResult,   setCanonicalResult]   = useState<string | null>(null)
  const canonicalStopRef = useRef(false)

  const handleEnrich = async ({ from, to }: { from: string | null; to: string | null }) => {
    stopRef.current = false
    setIsEnriching(true)
    setEnrichResult(null)
    setError(null)

    const acc = { processed: 0, improved: 0, skipped: 0 }
    try {
      while (true) {
        const params = new URLSearchParams({ limit: '30' })
        if (from) params.set('from', from)
        if (to) params.set('to', to)
        const url = `/api/admin/body-backfill?${params.toString()}`
        const res = await fetch(url, { method: 'POST' })
        if (!res.ok) throw new Error((await res.json() as { error?: string }).error ?? '풀본문 채우기 실패')
        const { processed, improved, skipped, remaining } = await res.json() as {
          processed: number; improved: number; skipped: number; remaining: number
        }
        acc.processed += processed
        acc.improved  += improved
        acc.skipped   += skipped

        if (stopRef.current) {
          setEnrichResult(`중단됨 · 누적 처리 ${acc.processed} · 남은 ${remaining.toLocaleString()}`)
          break
        }
        if (remaining === 0) {
          setEnrichResult(`완료 · 처리 ${acc.processed} · 개선 ${acc.improved} · 실패 ${acc.skipped}`)
          break
        }
        if (processed === 0) break

        setEnrichResult(`채우는 중… 누적 처리 ${acc.processed} · 개선 ${acc.improved} · 실패 ${acc.skipped} · 남은 ${remaining.toLocaleString()}`)
        await new Promise((r) => setTimeout(r, 300))
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '풀본문 채우기 중 오류가 발생했습니다.')
    } finally {
      setIsEnriching(false)
    }
  }

  const handleSignalClassify = async () => {
    signalStopRef.current = false
    setIsSignalling(true)
    setSignalResult(null)
    setError(null)
    const acc = { processed: 0, tagged: 0 }
    try {
      while (true) {
        const res = await fetch('/api/admin/signals-backfill?limit=10', { method: 'POST' })
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

  const handleCanonicalize = async () => {
    canonicalStopRef.current = false
    setIsCanonicalizing(true)
    setCanonicalResult(null)
    setError(null)
    const acc = { processed: 0, resolved: 0, deduped: 0 }
    try {
      while (true) {
        const res = await fetch('/api/admin/canonical-backfill?limit=15')
        if (!res.ok) throw new Error((await res.json() as { error?: string }).error ?? '원문 URL 정규화 실패')
        const { processed, resolved, deduped, remaining, ready } = await res.json() as {
          processed: number; resolved: number; deduped: number; remaining: number; ready: boolean
        }
        if (!ready) {
          setCanonicalResult('canonical_url 컬럼이 아직 적용되지 않았습니다.')
          break
        }
        acc.processed += processed
        acc.resolved  += resolved
        acc.deduped   += deduped

        if (canonicalStopRef.current) {
          setCanonicalResult(`중단됨 · 누적 처리 ${acc.processed} · 정규화 ${acc.resolved} · 중복병합 ${acc.deduped} · 남은 ${remaining.toLocaleString()}`)
          break
        }
        if (remaining === 0) {
          setCanonicalResult(`완료 · 처리 ${acc.processed} · 정규화 ${acc.resolved} · 중복병합 ${acc.deduped}`)
          break
        }
        if (processed === 0) break

        setCanonicalResult(`정규화 중… 누적 처리 ${acc.processed} · 정규화 ${acc.resolved} · 중복병합 ${acc.deduped} · 남은 ${remaining.toLocaleString()}`)
        await new Promise((r) => setTimeout(r, 300))
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '원문 URL 정규화 중 오류가 발생했습니다.')
    } finally {
      setIsCanonicalizing(false)
    }
  }

  // Date.now() purity 규칙 회피 (crawl-logs/page.tsx 패턴과 동일)
  const applyEnrichPreset = (days: number | null) => {
    if (days === null) { setEnrichFrom(''); setEnrichTo(''); return }
    const to = new Date().toISOString().slice(0, 10)
    const fromDate = new Date()
    fromDate.setDate(fromDate.getDate() - days)
    setEnrichFrom(fromDate.toISOString().slice(0, 10))
    setEnrichTo(to)
  }

  const startEnrich = () => {
    setIsEnrichRangeOpen(false)
    void handleEnrich({ from: enrichFrom || null, to: enrichTo || null })
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="flex items-start justify-between rounded-lg border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">
          <span>{error}</span>
          <button type="button" onClick={() => setError(null)} className="ml-4 shrink-0 underline">
            닫기
          </button>
        </div>
      )}

      {/* 풀본문 채우기 */}
      <div className="rounded-xl bg-card p-5 ring-1 ring-foreground/10">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="admin-card-title text-foreground">풀본문 채우기</p>
            <p className="admin-caption mt-1 max-w-lg text-muted-foreground">
              기사 본문을 원문에서 가져와 채웁니다. 기간을 골라 실행합니다.
            </p>
            <p className="admin-caption mt-2 text-muted-foreground">
              추출 성공률 ~60%(구글뉴스·봇차단 사이트는 구조적 실패). 탭을 열어둔 채 진행됩니다.
            </p>
            {enrichResult && (
              <p className="admin-caption mt-2 text-positive">
                {isEnriching ? <Loader2 className="mr-1 inline h-3 w-3 animate-spin" /> : '✅ '}{enrichResult}
              </p>
            )}
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="shrink-0"
            onClick={isEnriching ? () => { stopRef.current = true } : () => setIsEnrichRangeOpen(true)}
          >
            {isEnriching ? '중단' : '기사 풀본문 채우기'}
          </Button>
        </div>
      </div>

      {/* 신호 분류 */}
      <div className="rounded-xl bg-card p-5 ring-1 ring-foreground/10">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="admin-card-title text-foreground">신호 분류</p>
            <p className="admin-caption mt-1 max-w-lg text-muted-foreground">
              기사를 이벤트 유형(투자·M&A·규제·신제품 등)으로 자동 태깅합니다.
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
            onClick={isSignalling ? () => { signalStopRef.current = true } : handleSignalClassify}
          >
            {isSignalling ? '중단' : '신호 분류'}
          </Button>
        </div>
      </div>

      {/* 원문 URL 정규화 */}
      <div className="rounded-xl bg-card p-5 ring-1 ring-foreground/10">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="admin-card-title text-foreground">원문 URL 정규화</p>
            <p className="admin-caption mt-1 max-w-lg text-muted-foreground">
              구글뉴스 등 리다이렉트 주소를 실제 원문 주소로 정리합니다.
            </p>
            {canonicalResult && (
              <p className="admin-caption mt-2 text-positive">
                {isCanonicalizing ? <Loader2 className="mr-1 inline h-3 w-3 animate-spin" /> : '✅ '}{canonicalResult}
              </p>
            )}
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="shrink-0"
            onClick={isCanonicalizing ? () => { canonicalStopRef.current = true } : handleCanonicalize}
          >
            {isCanonicalizing ? '중단' : '원문 URL 정규화'}
          </Button>
        </div>
      </div>

      {/* 풀본문 채우기 기간 팝업 */}
      <Dialog open={isEnrichRangeOpen} onOpenChange={setIsEnrichRangeOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>풀본문 채우기 기간</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              {ENRICH_RANGE_PRESETS.map((preset) => (
                <Button
                  key={preset.label}
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => applyEnrichPreset(preset.days)}
                >
                  {preset.label}
                </Button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="enrich-from">시작일</Label>
                <Input
                  id="enrich-from"
                  type="date"
                  value={enrichFrom}
                  onChange={(e) => setEnrichFrom(e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="enrich-to">종료일</Label>
                <Input
                  id="enrich-to"
                  type="date"
                  value={enrichTo}
                  onChange={(e) => setEnrichTo(e.target.value)}
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              비워두면 전체 기간이 대상입니다.
            </p>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setIsEnrichRangeOpen(false)}>
              취소
            </Button>
            <Button type="button" onClick={startEnrich}>
              채우기 시작
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
