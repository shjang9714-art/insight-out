'use client'

// 348 — 패스②(분석) 반자동 경로.
// 앱은 사실 추출(패스①)까지만 하고, 해석은 Claude(MCP)에서 수동으로 돌린다.
// ① 분석 컨텍스트 복사 → ② Claude 붙여넣기 → ③ 결과 JSON 붙여넣기 → 앱이 근거 검증 후 저장.
// 나중에 유료 API를 붙이면 ①~③이 버튼 하나로 대체된다(스키마·검증·저장은 그대로 재사용).

import { useState } from 'react'
import { Check, Copy, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import AdminErrorBox from '@/components/admin/ui/AdminErrorBox'

interface DroppedItem { area: string; slot: string; text: string; reason: string }

interface ImportResult {
  analyzedAreas: number
  dropped: DroppedItem[]
  warnings: DroppedItem[]
}

export default function AdminCompetitorWeeklyAnalyze() {
  const [weekStart, setWeekStart] = useState('')
  const [loading, setLoading] = useState(false)
  const [copied, setCopied] = useState(false)
  const [contextInfo, setContextInfo] = useState<{ areaCount: number; eventCount: number } | null>(null)
  const [analysisText, setAnalysisText] = useState('')
  const [result, setResult] = useState<ImportResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleCopyContext = async () => {
    if (!weekStart) { setError('주 시작일(월요일, YYYY-MM-DD)을 입력하세요.'); return }
    setLoading(true); setError(null); setCopied(false); setResult(null)
    try {
      const res = await fetch(`/api/admin/competitor-weekly/analysis?week=${weekStart}`)
      const data = await res.json() as { prompt?: string; areaCount?: number; eventCount?: number; error?: string }
      if (!res.ok) throw new Error(data.error ?? '컨텍스트를 불러오지 못했습니다.')
      await navigator.clipboard.writeText(data.prompt ?? '')
      setContextInfo({ areaCount: data.areaCount ?? 0, eventCount: data.eventCount ?? 0 })
      setCopied(true)
      setTimeout(() => setCopied(false), 3000)
    } catch (e) {
      setError(e instanceof Error ? e.message : '컨텍스트 복사에 실패했습니다.')
    } finally {
      setLoading(false)
    }
  }

  const handleImport = async () => {
    if (!weekStart) { setError('주 시작일을 입력하세요.'); return }
    if (!analysisText.trim()) { setError('Claude 분석 결과(JSON)를 붙여넣으세요.'); return }
    setLoading(true); setError(null); setResult(null)
    try {
      const res = await fetch('/api/admin/competitor-weekly/analysis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ weekStart, analysis: analysisText }),
      })
      const data = await res.json() as ImportResult & { error?: string }
      if (!res.ok) throw new Error(data.error ?? '저장 실패')
      setResult({ analyzedAreas: data.analyzedAreas, dropped: data.dropped ?? [], warnings: data.warnings ?? [] })
    } catch (e) {
      setError(e instanceof Error ? e.message : '분석 결과 저장에 실패했습니다.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="rounded-xl border border-border bg-card p-5 space-y-4">
      <div>
        <h2 className="text-sm font-semibold text-foreground">주간 리포트 분석 (패스② · Claude 수동)</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          사실 추출(생성)이 끝난 주에 대해 컨텍스트를 복사 → Claude에 붙여넣기 → 결과 JSON을 다시 붙여넣으면
          근거 검증 후 저장됩니다. 근거가 없는 문장은 저장되지 않습니다.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <div className="flex flex-col gap-1">
          <label htmlFor="cw-week" className="text-xs text-muted-foreground">주 시작일 (월요일)</label>
          <input
            id="cw-week"
            type="date"
            value={weekStart}
            onChange={(e) => setWeekStart(e.target.value)}
            className="h-9 rounded-lg border border-border bg-background px-3 text-sm"
          />
        </div>
        <Button type="button" variant="outline" size="sm" onClick={handleCopyContext} disabled={loading} className="gap-1.5">
          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          {copied ? '복사됨' : '① 분석 컨텍스트 복사'}
        </Button>
        {contextInfo && (
          <span className="text-xs text-muted-foreground">
            영역 {contextInfo.areaCount}개 · 사건 {contextInfo.eventCount}건
          </span>
        )}
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="cw-analysis" className="text-xs text-muted-foreground">② Claude 분석 결과 (JSON)</label>
        <textarea
          id="cw-analysis"
          value={analysisText}
          onChange={(e) => setAnalysisText(e.target.value)}
          rows={8}
          placeholder='{"summary": "...", "overall_impact": "위기", "areas": [ ... ]}'
          className="rounded-lg border border-border bg-background p-3 font-mono text-xs"
        />
      </div>

      <Button type="button" size="sm" onClick={handleImport} disabled={loading} className="gap-1.5">
        {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
        ③ 검증 후 저장 (draft)
      </Button>

      {error && <AdminErrorBox>{error}</AdminErrorBox>}

      {result && (
        <div className="space-y-3 rounded-lg border border-border p-4">
          <p className="text-sm font-medium text-foreground">
            저장 완료 — 분석 반영 영역 {result.analyzedAreas}개
          </p>

          {result.dropped.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-negative">검증에서 제외된 문장 {result.dropped.length}건</p>
              <ul className="mt-1 space-y-1">
                {result.dropped.map((d, i) => (
                  <li key={i} className="text-xs text-muted-foreground">
                    <span className="text-foreground/70">[{d.area} · {d.slot}]</span> {d.text} — {d.reason}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {result.warnings.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-foreground/70">경고 {result.warnings.length}건 (저장은 됨)</p>
              <ul className="mt-1 space-y-1">
                {result.warnings.map((w, i) => (
                  <li key={i} className="text-xs text-muted-foreground">
                    <span className="text-foreground/70">[{w.area} · {w.slot}]</span> {w.text} — {w.reason}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {result.dropped.length === 0 && result.warnings.length === 0 && (
            <p className="text-xs text-muted-foreground">검증 통과 — 제외된 문장 없음.</p>
          )}
        </div>
      )}
    </div>
  )
}
