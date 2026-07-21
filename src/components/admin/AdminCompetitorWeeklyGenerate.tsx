'use client'

// 279 — /admin/insights 의 주간 경쟁 리포트 생성 패널을 /admin/competitor-weekly 로 이동.
// API 불변: POST /api/admin/competitor-weekly 그대로 재사용.

import { useState } from 'react'
import { Loader2, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import AdminErrorBox from '@/components/admin/ui/AdminErrorBox'
import InfoHelp from '@/components/admin/ui/InfoHelp'
import { COMPETITOR_WEEKLY_HELP } from '@/lib/admin/help'

interface CompetitorWeeklyArea {
  key: string
  label: string
}

interface CompetitorWeeklyResult {
  weekStart: string
  weekEnd: string
  status: string
  sections: number
  reason?: string
  areas?: CompetitorWeeklyArea[]
}

export default function AdminCompetitorWeeklyGenerate() {
  const [isGenerating, setIsGenerating] = useState(false)
  const [result, setResult] = useState<CompetitorWeeklyResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleGenerate = async () => {
    if (!window.confirm('최근 완결된 주(월~일)의 경쟁사 동향을 사업영역별로 종합한 경쟁사 주간 브리핑을 생성하시겠습니까? (LLM 호출)')) return
    setIsGenerating(true)
    setResult(null)
    setError(null)
    try {
      const res = await fetch('/api/admin/competitor-weekly', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      const data = await res.json() as { weekStart?: string; weekEnd?: string; status?: string; sections?: number; reason?: string; areas?: CompetitorWeeklyArea[]; error?: string }
      if (!res.ok) throw new Error(data.error ?? '생성 실패')
      setResult({
        weekStart: data.weekStart ?? '',
        weekEnd: data.weekEnd ?? '',
        status: data.status ?? 'draft',
        sections: data.sections ?? 0,
        reason: data.reason,
        areas: data.areas,
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : '경쟁사 주간 브리핑 생성에 실패했습니다.')
    } finally {
      setIsGenerating(false)
    }
  }

  return (
    <div className="rounded-xl border border-border bg-card p-5 space-y-4">
      <div className="flex items-center gap-1.5">
        <h2 className="text-sm font-semibold text-foreground">경쟁사 주간 브리핑 생성 (패스① 사실추출)</h2>
        <InfoHelp copy={COMPETITOR_WEEKLY_HELP} />
      </div>
      <p className="text-xs text-muted-foreground">
        경쟁사(통신 3사 중심) 기사를 사업영역별(AIDC·AICC·통신B2B·보안·클라우드·IT 등)로 종합해 위기·기회를 판정합니다. 기본은 최근 완결된 주(월~일).
      </p>
      <div className="flex items-center gap-3 flex-wrap">
        <Button onClick={() => void handleGenerate()} disabled={isGenerating} size="sm" variant="brand">
          {isGenerating ? (
            <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />생성 중...</>
          ) : (
            <><Sparkles className="h-3.5 w-3.5 mr-1.5" />경쟁사 주간 브리핑 생성</>
          )}
        </Button>
      </div>
      {result && (
        // 398 — reason 유무로 성패를 가른다(status는 348 설계상 패스①은 항상 draft라 무의미).
        result.reason || result.sections === 0 ? (
          <AdminErrorBox>{result.reason ?? '알 수 없는 오류로 생성된 사업영역이 없습니다.'}</AdminErrorBox>
        ) : (
          <p className="text-sm text-muted-foreground">
            {result.weekStart} ~ {result.weekEnd} 사실추출 완료 (사업영역 {result.sections}개
            {result.areas && result.areas.length > 0 ? ` — ${result.areas.map((a) => a.label).join(' · ')}` : ''}) — 분석(패스②) 대기
          </p>
        )
      )}
      {error && <AdminErrorBox>{error}</AdminErrorBox>}
    </div>
  )
}
