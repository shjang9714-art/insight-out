'use client'

// 348 — 패스②(분석) 반자동 경로.
// 앱은 사실 추출(패스①)까지만 하고, 해석은 Claude(MCP)에서 수동으로 돌린다.
// ① 분석 컨텍스트 복사 → ② Claude 붙여넣기 → ③ 결과 JSON 붙여넣기 → 앱이 근거 검증 후 저장.
// 나중에 유료 API를 붙이면 ①~③이 버튼 하나로 대체된다(스키마·검증·저장은 그대로 재사용).

import { useState } from 'react'
import { Check, Copy, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import AdminErrorBox from '@/components/admin/ui/AdminErrorBox'
import { copyText } from '@/lib/clipboard'
import type { CompetitorWeeklyRow } from '@/components/admin/CompetitorWeeklyManager'

interface DroppedItem { area: string; slot: string; text: string; reason: string }

interface ImportResult {
  analyzedAreas: number
  dropped: DroppedItem[]
  warnings: DroppedItem[]
}

// 398 — CompetitorWeeklyManager의 STATUS_LABELS와 동일 값(비공개라 여기 자체 정의).
const STATUS_LABEL: Record<string, string> = {
  draft: '초안',
  published: '발행됨',
  archived: '보관',
}

interface AdminCompetitorWeeklyAnalyzeProps {
  /** 398 — 새 API 없이 페이지가 이미 조회한 최근 10건을 재사용해 주 선택 드롭다운을 채운다. */
  reports: CompetitorWeeklyRow[]
}

export default function AdminCompetitorWeeklyAnalyze({ reports }: AdminCompetitorWeeklyAnalyzeProps) {
  const [weekStart, setWeekStart] = useState(reports[0]?.week_start ?? '')
  const [loading, setLoading] = useState(false)
  const [copied, setCopied] = useState(false)
  const [clipboardBlocked, setClipboardBlocked] = useState(false)
  const [contextInfo, setContextInfo] = useState<{ areaCount: number; eventCount: number } | null>(null)
  const [contextPrompt, setContextPrompt] = useState('')
  const [analysisText, setAnalysisText] = useState('')
  const [result, setResult] = useState<ImportResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const selectedAreaLabels = reports.find((r) => r.week_start === weekStart)?.sections.map((s) => s.area_label) ?? []

  const handleCopyContext = async () => {
    if (!weekStart) { setError('주 시작일(월요일, YYYY-MM-DD)을 입력하세요.'); return }
    setLoading(true); setError(null); setCopied(false); setResult(null)
    try {
      const res = await fetch(`/api/admin/competitor-weekly/analysis?week=${weekStart}`)
      const data = await res.json() as { prompt?: string; areaCount?: number; eventCount?: number; error?: string }
      if (!res.ok) throw new Error(data.error ?? '컨텍스트를 불러오지 못했습니다.')
      const prompt = data.prompt ?? ''
      // 프롬프트는 자동복사 성공 여부와 무관하게 항상 확보한다(fetch로 user activation이 만료돼
      // 클립보드 쓰기가 거부돼도 아래 상자에서 수동 복사 가능하도록).
      setContextPrompt(prompt)
      setContextInfo({ areaCount: data.areaCount ?? 0, eventCount: data.eventCount ?? 0 })
      const ok = await copyText(prompt)
      setClipboardBlocked(!ok)
      if (ok) {
        setCopied(true)
        setTimeout(() => setCopied(false), 3000)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '컨텍스트를 불러오지 못했습니다.')
    } finally {
      setLoading(false)
    }
  }

  const handleManualCopy = () => {
    // 사용자 클릭에 직접 붙은 동기 진입 — await 선행 없이 곧바로 호출해 성공률을 높인다.
    void copyText(contextPrompt).then((ok) => {
      setClipboardBlocked(!ok)
      if (ok) {
        setCopied(true)
        setTimeout(() => setCopied(false), 3000)
      }
    })
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
      <div className="space-y-2">
        <div className="flex flex-col gap-1">
          <label htmlFor="cw-week" className="text-xs text-muted-foreground">주 시작일 (월요일)</label>
          {reports.length === 0 ? (
            <p className="text-xs text-muted-foreground">먼저 사실 추출(생성)을 실행하세요.</p>
          ) : (
            <select
              id="cw-week"
              value={weekStart}
              onChange={(e) => setWeekStart(e.target.value)}
              className="h-9 w-fit rounded-lg border border-border bg-background px-3 text-sm"
            >
              {reports.map((r) => (
                <option key={r.week_start} value={r.week_start}>
                  {r.week_start} ~ {r.week_end.slice(5)} ({STATUS_LABEL[r.status] ?? r.status})
                </option>
              ))}
            </select>
          )}
        </div>

        {/* 398 — 선택된 주의 영역 목록(패스①에서 실제로 만들어진 섹션만). */}
        {selectedAreaLabels.length > 0 && (
          <p className="text-xs text-muted-foreground">
            영역 {selectedAreaLabels.length}개 — {selectedAreaLabels.join(' · ')}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" size="sm" onClick={handleCopyContext} disabled={loading || reports.length === 0} className="gap-1.5">
            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            {copied ? '복사됨' : '① 프롬프트+데이터 복사'}
          </Button>
          {contextInfo && (
            <span className="text-xs text-muted-foreground">
              영역 {contextInfo.areaCount}개 · 사건 {contextInfo.eventCount}건
            </span>
          )}
        </div>

        {contextPrompt && (
          <div className="flex flex-col gap-1">
            {clipboardBlocked && (
              <p className="text-xs text-muted-foreground">
                자동 복사가 차단됐어요 — 아래 상자에서 직접 복사하세요.
              </p>
            )}
            <div className="flex items-start gap-2">
              <textarea
                readOnly
                value={contextPrompt}
                rows={6}
                onFocus={(e) => e.currentTarget.select()}
                className="w-full rounded-md border border-border bg-background p-2 font-mono text-xs"
              />
              <Button type="button" variant="outline" size="sm" onClick={handleManualCopy} className="shrink-0 gap-1.5">
                {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                복사
              </Button>
            </div>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="cw-analysis" className="text-xs text-muted-foreground">
          ② LLM 분석 결과 — 객체 {'{ summary, overall_impact, areas: [...] }'}
        </label>
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
