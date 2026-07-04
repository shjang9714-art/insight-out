'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Loader2, Sparkles } from 'lucide-react'

interface RefreshResult {
  ok: boolean
  insights?: number
  candidates?: number
  timelines?: number
  briefs?: number
  errors?: string[]
  skipped?: boolean
}

export default function AiRefreshButton() {
  const [isRunning, setIsRunning] = useState(false)
  const [lastResult, setLastResult] = useState<{ at: string; data: RefreshResult } | null>(null)

  const handleRun = async () => {
    if (isRunning) return
    setIsRunning(true)
    try {
      const res = await fetch('/api/admin/ai-refresh', { method: 'POST' })
      const data = await res.json() as RefreshResult
      setLastResult({ at: new Date().toLocaleTimeString('ko-KR'), data })
    } catch {
      setLastResult({ at: new Date().toLocaleTimeString('ko-KR'), data: { ok: false, errors: ['네트워크 오류'] } })
    } finally {
      setIsRunning(false)
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button
        size="sm"
        variant="outline"
        onClick={() => { void handleRun() }}
        disabled={isRunning}
        title={isRunning ? '실행 중… 최대 5분 소요됩니다.' : undefined}
      >
        {isRunning
          ? <><Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />AI 갱신 중… (최대 5분)</>
          : <><Sparkles className="mr-1.5 h-3.5 w-3.5" />지금 AI 갱신</>
        }
      </Button>
      {lastResult && (
        <span className="text-xs text-muted-foreground">
          {lastResult.at} —{' '}
          {lastResult.data.skipped
            ? '스킵(LLM 키 없음)'
            : lastResult.data.ok
              ? `인사이트 ${lastResult.data.insights ?? 0} · 후보 ${lastResult.data.candidates ?? 0} · 타임라인 ${lastResult.data.timelines ?? 0} · 브리핑 ${lastResult.data.briefs ?? 0}`
              : `실패: ${(lastResult.data.errors ?? ['오류']).join(', ')}`
          }
        </span>
      )}
    </div>
  )
}
