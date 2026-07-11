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
import AdminErrorBox from '@/components/admin/ui/AdminErrorBox'

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

  // 썸네일 재시도(og:image) — 219, 모드(282)
  const [isThumbRetrying, setIsThumbRetrying] = useState(false)
  const [thumbRetryResult, setThumbRetryResult] = useState<string | null>(null)
  const thumbRetryStopRef = useRef(false)

  // 유튜브 자막 수집 — 265, 모드(282 패턴)
  const [isTranscriptRetrying, setIsTranscriptRetrying] = useState(false)
  const [transcriptResult, setTranscriptResult] = useState<string | null>(null)
  const transcriptStopRef = useRef(false)

  // PDF 표지 수집 — 286, 모드(282 패턴)
  const [isPdfCoverRetrying, setIsPdfCoverRetrying] = useState(false)
  const [pdfCoverResult, setPdfCoverResult] = useState<string | null>(null)
  const pdfCoverStopRef = useRef(false)

  // 관련기사 재클러스터링(본문 유사도) — 220
  const [isClustering, setIsClustering] = useState(false)
  const [clusterResult, setClusterResult] = useState<string | null>(null)
  const clusterStopRef = useRef(false)

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

  const handleThumbnailRetry = async (mode: 'fresh' | 'retry') => {
    thumbRetryStopRef.current = false
    setIsThumbRetrying(true)
    setThumbRetryResult(null)
    setError(null)
    const acc = { processed: 0, filled: 0, skipped: 0 }
    try {
      while (true) {
        const res = await fetch(`/api/admin/thumbnail-backfill?limit=20&mode=${mode}`, { method: 'POST' })
        if (!res.ok) throw new Error((await res.json() as { error?: string }).error ?? '썸네일 재시도 실패')
        const { processed, filled, skipped, remaining, ready } = await res.json() as {
          processed: number; filled: number; skipped: number; remaining: number; ready: boolean
        }
        if (!ready) {
          setThumbRetryResult('219 SQL 적용이 필요합니다.')
          break
        }
        acc.processed += processed
        acc.filled    += filled
        acc.skipped   += skipped

        if (thumbRetryStopRef.current) {
          setThumbRetryResult(`중단됨 · 누적 처리 ${acc.processed} · 성공 ${acc.filled} · 남은 ${remaining.toLocaleString()}`)
          break
        }
        if (remaining === 0) {
          setThumbRetryResult(`완료 · 처리 ${acc.processed} · 성공 ${acc.filled} · 스킵 ${acc.skipped}`)
          break
        }
        if (processed === 0) break

        setThumbRetryResult(`채우는 중… 누적 처리 ${acc.processed} · 성공 ${acc.filled} · 남은 ${remaining.toLocaleString()}`)
        await new Promise((r) => setTimeout(r, 300))
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '썸네일 재시도 중 오류가 발생했습니다.')
    } finally {
      setIsThumbRetrying(false)
    }
  }

  const handleTranscriptRetry = async (mode: 'fresh' | 'retry') => {
    transcriptStopRef.current = false
    setIsTranscriptRetrying(true)
    setTranscriptResult(null)
    setError(null)
    const acc = { processed: 0, fetched: 0, skipped: 0 }
    try {
      while (true) {
        const res = await fetch(`/api/admin/youtube-transcript?limit=10&mode=${mode}`, { method: 'POST' })
        if (!res.ok) throw new Error((await res.json() as { error?: string }).error ?? '유튜브 자막 수집 실패')
        const { processed, fetched, skipped, remaining, ready } = await res.json() as {
          processed: number; fetched: number; skipped: number; remaining: number; ready: boolean
        }
        if (!ready) {
          setTranscriptResult('265 SQL 적용이 필요합니다.')
          break
        }
        acc.processed += processed
        acc.fetched   += fetched
        acc.skipped   += skipped

        if (transcriptStopRef.current) {
          setTranscriptResult(`중단됨 · 누적 처리 ${acc.processed} · 수집 ${acc.fetched} · 남은 ${remaining.toLocaleString()}`)
          break
        }
        if (remaining === 0) {
          setTranscriptResult(`완료 · 처리 ${acc.processed} · 수집 ${acc.fetched} · 스킵 ${acc.skipped}`)
          break
        }
        if (processed === 0) break

        setTranscriptResult(`수집 중… 누적 처리 ${acc.processed} · 수집 ${acc.fetched} · 남은 ${remaining.toLocaleString()}`)
        await new Promise((r) => setTimeout(r, 300))
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '유튜브 자막 수집 중 오류가 발생했습니다.')
    } finally {
      setIsTranscriptRetrying(false)
    }
  }

  const handlePdfCoverRetry = async (mode: 'fresh' | 'retry') => {
    pdfCoverStopRef.current = false
    setIsPdfCoverRetrying(true)
    setPdfCoverResult(null)
    setError(null)
    const acc = { processed: 0, filled: 0, skipped: 0 }
    try {
      while (true) {
        const res = await fetch(`/api/admin/pdf-cover-backfill?limit=5&mode=${mode}`, { method: 'POST' })
        if (!res.ok) throw new Error((await res.json() as { error?: string }).error ?? 'PDF 표지 수집 실패')
        const { processed, filled, skipped, remaining, ready } = await res.json() as {
          processed: number; filled: number; skipped: number; remaining: number; ready: boolean
        }
        if (!ready) {
          setPdfCoverResult('219 SQL 적용이 필요합니다.')
          break
        }
        acc.processed += processed
        acc.filled    += filled
        acc.skipped   += skipped

        if (pdfCoverStopRef.current) {
          setPdfCoverResult(`중단됨 · 누적 처리 ${acc.processed} · 설정 ${acc.filled} · 남은 ${remaining.toLocaleString()}`)
          break
        }
        if (remaining === 0) {
          setPdfCoverResult(`완료 · 처리 ${acc.processed} · 설정 ${acc.filled} · 스킵 ${acc.skipped}`)
          break
        }
        if (processed === 0) break

        setPdfCoverResult(`수집 중… 누적 처리 ${acc.processed} · 설정 ${acc.filled} · 남은 ${remaining.toLocaleString()}`)
        await new Promise((r) => setTimeout(r, 300))
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'PDF 표지 수집 중 오류가 발생했습니다.')
    } finally {
      setIsPdfCoverRetrying(false)
    }
  }

  const handleClusterBackfill = async () => {
    clusterStopRef.current = false
    setIsClustering(true)
    setClusterResult(null)
    setError(null)
    const acc = { processed: 0, merged: 0, repChanged: 0 }
    try {
      while (true) {
        const res = await fetch('/api/admin/cluster-backfill?limit=20', { method: 'POST' })
        if (!res.ok) throw new Error((await res.json() as { error?: string }).error ?? '재클러스터링 실패')
        const { processed, merged, repChanged, remaining, ready } = await res.json() as {
          processed: number; merged: number; repChanged: number; remaining: number; ready: boolean
        }
        if (!ready) {
          setClusterResult('220 SQL 적용이 필요합니다.')
          break
        }
        acc.processed   += processed
        acc.merged      += merged
        acc.repChanged  += repChanged

        if (clusterStopRef.current) {
          setClusterResult(`중단됨 · 누적 처리 ${acc.processed} · 병합 ${acc.merged} · 남은 ${remaining.toLocaleString()}`)
          break
        }
        if (remaining === 0) {
          setClusterResult(`완료 · 처리 ${acc.processed} · 병합 ${acc.merged} · 대표교체 ${acc.repChanged}`)
          break
        }
        if (processed === 0) break

        setClusterResult(`재평가 중… 누적 처리 ${acc.processed} · 병합 ${acc.merged} · 남은 ${remaining.toLocaleString()}`)
        await new Promise((r) => setTimeout(r, 300))
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '재클러스터링 중 오류가 발생했습니다.')
    } finally {
      setIsClustering(false)
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
        <AdminErrorBox onDismiss={() => setError(null)}>
          {error}
        </AdminErrorBox>
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

      {/* 썸네일 재시도(og:image) — 219 */}
      <div className="rounded-xl bg-card p-5 ring-1 ring-foreground/10">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="admin-card-title text-foreground">썸네일 재시도(og:image)</p>
            <p className="admin-caption mt-1 max-w-lg text-muted-foreground">
              썸네일이 없는 크롤 뉴스·웹인사이트의 원문 og:image를 다시 받아옵니다.
              신규는 &ldquo;아직 시도 안 함&rdquo;, 과거 실패 재시도는 &ldquo;실패행 재시도&rdquo;를 사용하세요.
            </p>
            {thumbRetryResult && (
              <p className="admin-caption mt-2 text-positive">
                {isThumbRetrying ? <Loader2 className="mr-1 inline h-3 w-3 animate-spin" /> : '✅ '}{thumbRetryResult}
              </p>
            )}
          </div>
          <div className="flex shrink-0 gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={isThumbRetrying ? () => { thumbRetryStopRef.current = true } : () => handleThumbnailRetry('fresh')}
            >
              {isThumbRetrying ? '중단' : '아직 시도 안 함'}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={isThumbRetrying}
              onClick={() => handleThumbnailRetry('retry')}
            >
              실패행 재시도
            </Button>
          </div>
        </div>
      </div>

      {/* 유튜브 자막 수집 — 265 */}
      <div className="rounded-xl bg-card p-5 ring-1 ring-foreground/10">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="admin-card-title text-foreground">유튜브 자막 수집</p>
            <p className="admin-caption mt-1 max-w-lg text-muted-foreground">
              유튜브 영상의 자막을 수집해 한글로 번역합니다(비공식 엔드포인트 — 순차 처리, rate limit 주의).
              신규는 &ldquo;아직 시도 안 함&rdquo;, 과거 실패 재시도는 &ldquo;실패행 재시도&rdquo;를 사용하세요.
            </p>
            {transcriptResult && (
              <p className="admin-caption mt-2 text-positive">
                {isTranscriptRetrying ? <Loader2 className="mr-1 inline h-3 w-3 animate-spin" /> : '✅ '}{transcriptResult}
              </p>
            )}
          </div>
          <div className="flex shrink-0 gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={isTranscriptRetrying ? () => { transcriptStopRef.current = true } : () => handleTranscriptRetry('fresh')}
            >
              {isTranscriptRetrying ? '중단' : '아직 시도 안 함'}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={isTranscriptRetrying}
              onClick={() => handleTranscriptRetry('retry')}
            >
              실패행 재시도
            </Button>
          </div>
        </div>
      </div>

      {/* PDF 표지 수집 — 286 */}
      <div className="rounded-xl bg-card p-5 ring-1 ring-foreground/10">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="admin-card-title text-foreground">PDF 표지 수집</p>
            <p className="admin-caption mt-1 max-w-lg text-muted-foreground">
              업로드된 PDF의 첫 페이지를 표지로 설정합니다. 표지가 이미 있으면 건너뜁니다.
              신규는 &ldquo;아직 시도 안 함&rdquo;, 과거 실패 재시도는 &ldquo;실패행 재시도&rdquo;를 사용하세요.
            </p>
            {pdfCoverResult && (
              <p className="admin-caption mt-2 text-positive">
                {isPdfCoverRetrying ? <Loader2 className="mr-1 inline h-3 w-3 animate-spin" /> : '✅ '}{pdfCoverResult}
              </p>
            )}
          </div>
          <div className="flex shrink-0 gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={isPdfCoverRetrying ? () => { pdfCoverStopRef.current = true } : () => handlePdfCoverRetry('fresh')}
            >
              {isPdfCoverRetrying ? '중단' : '아직 시도 안 함'}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={isPdfCoverRetrying}
              onClick={() => handlePdfCoverRetry('retry')}
            >
              실패행 재시도
            </Button>
          </div>
        </div>
      </div>

      {/* 관련기사 재클러스터링(본문 유사도) — 220 */}
      <div className="rounded-xl bg-card p-5 ring-1 ring-foreground/10">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="admin-card-title text-foreground">관련기사 재클러스터링(본문 유사도)</p>
            <p className="admin-caption mt-1 max-w-lg text-muted-foreground">
              제목만으론 못 묶인 같은 사건 기사를 본문 유사도로 재평가해 병합하고, 신호 기반으로 대표를 재선정합니다.
            </p>
            {clusterResult && (
              <p className="admin-caption mt-2 text-positive">
                {isClustering ? <Loader2 className="mr-1 inline h-3 w-3 animate-spin" /> : '✅ '}{clusterResult}
              </p>
            )}
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="shrink-0"
            onClick={isClustering ? () => { clusterStopRef.current = true } : handleClusterBackfill}
          >
            {isClustering ? '중단' : '재클러스터링'}
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
