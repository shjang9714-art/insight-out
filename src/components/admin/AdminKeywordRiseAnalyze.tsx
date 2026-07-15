'use client'

import { useState } from 'react'
import { Check, Copy, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import AdminErrorBox from '@/components/admin/ui/AdminErrorBox'

interface VerifyItem {
  slot: string
  text: string
  reason: string
}

interface ImportResult {
  savedFactors: number
  status: string
  dropped: VerifyItem[]
  warnings: VerifyItem[]
}

export default function AdminKeywordRiseAnalyze() {
  const [name, setName] = useState('')
  const [analysisText, setAnalysisText] = useState('')
  const [factCount, setFactCount] = useState<number | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isCopied, setIsCopied] = useState(false)
  const [copiedPrompt, setCopiedPrompt] = useState('')
  const [clipboardBlocked, setClipboardBlocked] = useState(false)
  const [result, setResult] = useState<ImportResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function handleCopyContext() {
    const keyword = name.trim()
    if (!keyword) {
      setError('분석할 키워드를 입력해주세요.')
      return
    }
    setIsLoading(true)
    setError(null)
    setResult(null)
    setIsCopied(false)
    try {
      const response = await fetch(`/api/admin/keywords/rise?name=${encodeURIComponent(keyword)}`)
      const data = await response.json() as { prompt?: string; factCount?: number; error?: string }
      if (!response.ok) throw new Error(data.error ?? '분석 컨텍스트를 불러오지 못했습니다.')
      const prompt = data.prompt ?? ''
      // 프롬프트는 자동복사 성공 여부와 무관하게 항상 확보한다(권한 차단 시 수동복사 폴백용).
      setCopiedPrompt(prompt)
      setFactCount(data.factCount ?? 0)
      try {
        if (!navigator.clipboard) throw new Error('클립보드 API 를 사용할 수 없습니다.')
        await navigator.clipboard.writeText(prompt)
        setClipboardBlocked(false)
        setIsCopied(true)
        window.setTimeout(() => setIsCopied(false), 3000)
      } catch {
        setClipboardBlocked(true)
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '분석 컨텍스트 복사에 실패했습니다.')
    } finally {
      setIsLoading(false)
    }
  }

  async function handleImport() {
    const keyword = name.trim()
    if (!keyword) {
      setError('분석할 키워드를 입력해주세요.')
      return
    }
    if (!analysisText.trim()) {
      setError('Claude 분석 결과(JSON)를 붙여넣어주세요.')
      return
    }
    setIsLoading(true)
    setError(null)
    setResult(null)
    try {
      const response = await fetch('/api/admin/keywords/rise', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: keyword, analysis: analysisText }),
      })
      const data = await response.json() as Partial<ImportResult> & { error?: string }
      if (!response.ok) throw new Error(data.error ?? '분석 결과를 저장하지 못했습니다.')
      setResult({
        savedFactors: data.savedFactors ?? 0,
        status: data.status ?? 'draft',
        dropped: data.dropped ?? [],
        warnings: data.warnings ?? [],
      })
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '분석 결과 저장에 실패했습니다.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <section className="space-y-4 rounded-xl border border-border bg-card p-5">
      <div>
        <h2 className="text-sm font-semibold text-foreground">키워드 상승 요인 분석 (패스② · Claude 수동)</h2>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          상승 또는 신규 키워드의 사실 컨텍스트를 복사해 Claude에서 분석한 뒤 JSON을 붙여넣으세요.
          존재하는 사건 근거가 없는 요인은 저장되지 않습니다.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <div className="flex min-w-56 flex-col gap-1">
          <label htmlFor="keyword-rise-name" className="text-xs text-muted-foreground">키워드</label>
          <Input
            id="keyword-rise-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="예: 소버린 AI"
            className="h-9"
          />
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleCopyContext}
          disabled={isLoading}
          className="gap-1.5"
        >
          {isCopied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          {isCopied ? '복사됨' : '① 분석 컨텍스트 복사'}
        </Button>
        {factCount !== null && (
          <span className="text-xs text-muted-foreground">근거 사건 {factCount}건</span>
        )}
      </div>

      {copiedPrompt && (
        <details open={clipboardBlocked} className="rounded-lg border border-border p-3">
          <summary className="cursor-pointer text-xs font-medium text-muted-foreground">
            {clipboardBlocked
              ? '자동 복사가 차단됐습니다 — 아래 내용을 직접 복사하세요'
              : '분석 컨텍스트 원문 (펼쳐서 다시 보기)'}
          </summary>
          <textarea
            readOnly
            value={copiedPrompt}
            rows={10}
            onFocus={(event) => event.currentTarget.select()}
            className="mt-2 w-full rounded-md border border-border bg-background p-2 font-mono text-xs"
          />
        </details>
      )}

      <div className="flex flex-col gap-1">
        <label htmlFor="keyword-rise-analysis" className="text-xs text-muted-foreground">
          ② Claude 분석 결과 (JSON)
        </label>
        <textarea
          id="keyword-rise-analysis"
          value={analysisText}
          onChange={(event) => setAnalysisText(event.target.value)}
          rows={8}
          placeholder='{"overview":"...","factors":[{"thesis":"...","detail":"...","evidence":["evt_001"]}]}'
          className="rounded-lg border border-border bg-background p-3 font-mono text-xs"
        />
      </div>

      <Button type="button" size="sm" onClick={handleImport} disabled={isLoading} className="gap-1.5">
        {isLoading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
        ③ 근거 검증 후 저장 (draft)
      </Button>

      {error && <AdminErrorBox>{error}</AdminErrorBox>}

      {result && (
        <div className="space-y-3 rounded-lg border border-border p-4">
          <p className="text-sm font-medium text-foreground">
            저장 완료 — 근거 검증 통과 요인 {result.savedFactors}개
          </p>
          {result.dropped.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-negative">검증에서 제외된 요인 {result.dropped.length}건</p>
              <ul className="mt-1 space-y-1">
                {result.dropped.map((item, index) => (
                  <li key={`${item.slot}-${index}`} className="text-xs text-muted-foreground">
                    <span className="text-foreground/70">[{item.slot}]</span> {item.text} — {item.reason}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {result.warnings.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-foreground/70">수치 근거 경고 {result.warnings.length}건</p>
              <ul className="mt-1 space-y-1">
                {result.warnings.map((item, index) => (
                  <li key={`${item.slot}-${index}`} className="text-xs text-muted-foreground">
                    <span className="text-foreground/70">[{item.slot}]</span> {item.text} — {item.reason}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {result.dropped.length === 0 && result.warnings.length === 0 && (
            <p className="text-xs text-muted-foreground">모든 요인이 근거 검증을 통과했습니다.</p>
          )}
        </div>
      )}
    </section>
  )
}
