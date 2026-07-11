'use client'

import { useState } from 'react'
import { Loader2, PlusCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import AdminErrorBox from '@/components/admin/ui/AdminErrorBox'
import AdminSectionHeader from '@/components/admin/ui/AdminSectionHeader'
import ReportSourcePicker from '@/components/admin/reports/ReportSourcePicker'
import type { AiReportType } from '@/lib/types'

const REPORT_TYPES: AiReportType[] = ['시장동향', '경쟁사분석', '키워드분석', '서비스리포트', '자유주제']

interface ReportCreateFormProps {
  onCreated: () => void
}

export default function ReportCreateForm({ onCreated }: ReportCreateFormProps) {
  const [type, setType] = useState<AiReportType>('시장동향')
  const [topic, setTopic] = useState('')
  const [title, setTitle] = useState('')
  const [promptOverride, setPromptOverride] = useState('')
  const [selectedIssueIds, setSelectedIssueIds] = useState<Set<string>>(new Set())
  const [selectedContentIds, setSelectedContentIds] = useState<Set<string>>(new Set())
  const [isGenerating, setIsGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleGenerate = async () => {
    if (!topic.trim()) {
      setError('주제를 입력해주세요.')
      return
    }
    setIsGenerating(true)
    setError(null)
    try {
      const res = await fetch('/api/reports/generate-strategy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type,
          topic: topic.trim(),
          title: title.trim() || undefined,
          sourceIssueIds: Array.from(selectedIssueIds),
          contentIds: Array.from(selectedContentIds),
          promptOverride: promptOverride.trim() || undefined,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? '생성에 실패했습니다.')
      if (json.status === 'failed') {
        setError(json.error ?? '생성에 실패했습니다.')
      } else {
        setTopic('')
        setTitle('')
        setPromptOverride('')
        setSelectedIssueIds(new Set())
        setSelectedContentIds(new Set())
      }
      onCreated()
    } catch (err) {
      setError(err instanceof Error ? err.message : '생성 중 오류가 발생했습니다.')
    } finally {
      setIsGenerating(false)
    }
  }

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <AdminSectionHeader icon={PlusCircle} title="새 보고서 생성" />

      {error && <div className="mb-3"><AdminErrorBox onDismiss={() => setError(null)}>{error}</AdminErrorBox></div>}

      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-[11px] text-muted-foreground">유형</label>
            <Select value={type} onValueChange={(v) => setType(v as AiReportType)}>
              <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                {REPORT_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>{t}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="mb-1 block text-[11px] text-muted-foreground">제목(선택)</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="비워두면 주제를 제목으로 사용"
              className="h-9 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-brand-600/30"
            />
          </div>
        </div>

        <div>
          <label className="mb-1 block text-[11px] text-muted-foreground">주제(필수)</label>
          <input
            type="text"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="예: 2026년 하반기 AICC 시장 동향"
            className="h-9 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-brand-600/30"
          />
        </div>

        <details className="rounded-lg border border-border p-3">
          <summary className="cursor-pointer text-xs font-medium text-foreground">소스·프롬프트(선택)</summary>
          <div className="mt-3 space-y-3">
            <ReportSourcePicker
              selectedIssueIds={selectedIssueIds}
              onChangeIssueIds={setSelectedIssueIds}
              selectedContentIds={selectedContentIds}
              onChangeContentIds={setSelectedContentIds}
            />
            <div>
              <label className="mb-1 block text-[11px] text-muted-foreground">프롬프트 오버라이드</label>
              <textarea
                value={promptOverride}
                onChange={(e) => setPromptOverride(e.target.value)}
                rows={3}
                placeholder="비워두면 어드민 프롬프트(strategy_report)를 사용합니다."
                className="w-full rounded-lg border border-border bg-background p-2.5 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-brand-600/30"
              />
            </div>
          </div>
        </details>

        <div className="flex justify-end">
          <Button type="button" variant="brand" onClick={handleGenerate} disabled={isGenerating}>
            {isGenerating && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
            생성
          </Button>
        </div>
      </div>
    </div>
  )
}
