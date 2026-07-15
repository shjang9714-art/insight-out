'use client'

// 350 — 통합 프롬프트 콘솔.
// 프롬프트를 쓰는 모든 AI 생성기가 참조하는 llm_prompts 를 한 화면에서 편집·저장한다.
// 저장(초안 반영)은 즉시 적용 — 다음 생성부터 이 프롬프트가 쓰인다. 검수는 생성 결과로 한다.

import { useEffect, useState } from 'react'
import { Loader2, RotateCcw, Save } from 'lucide-react'
import { Button } from '@/components/ui/button'
import AdminErrorBox from '@/components/admin/ui/AdminErrorBox'

interface PromptItem {
  key: string
  label: string
  group: string
  description: string
  promptText: string
  saved: boolean
  updatedAt: string | null
  fallback: string
}

export default function PromptConsole() {
  const [prompts, setPrompts] = useState<PromptItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tableApplied, setTableApplied] = useState(true)

  // key별 편집 버퍼(원본과 다르면 '변경됨')
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [savingKey, setSavingKey] = useState<string | null>(null)
  const [savedKey, setSavedKey] = useState<string | null>(null)

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/admin/prompts')
        const data = await res.json() as { prompts?: PromptItem[]; tableApplied?: boolean; error?: string }
        if (!res.ok) throw new Error(data.error ?? '프롬프트를 불러오지 못했습니다.')
        setPrompts(data.prompts ?? [])
        setTableApplied(data.tableApplied ?? true)
        setDrafts(Object.fromEntries((data.prompts ?? []).map(p => [p.key, p.promptText])))
      } catch (e) {
        setError(e instanceof Error ? e.message : '불러오기 실패')
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  const save = async (item: PromptItem) => {
    const text = drafts[item.key] ?? ''
    if (!text.trim()) { setError('프롬프트 내용이 비어 있습니다.'); return }
    setSavingKey(item.key); setError(null); setSavedKey(null)
    try {
      const res = await fetch('/api/admin/prompts', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: item.key, prompt_text: text }),
      })
      const data = await res.json() as { error?: string }
      if (!res.ok) throw new Error(data.error ?? '저장 실패')
      setPrompts(prev => prev.map(p => p.key === item.key
        ? { ...p, promptText: text, saved: true, updatedAt: new Date().toISOString() } : p))
      setSavedKey(item.key)
      setTimeout(() => setSavedKey(null), 2500)
    } catch (e) {
      setError(e instanceof Error ? e.message : '저장 실패')
    } finally {
      setSavingKey(null)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> 프롬프트 불러오는 중…
      </div>
    )
  }

  const groups = [...new Set(prompts.map(p => p.group))]

  return (
    <div className="space-y-5">
      {!tableApplied && (
        <AdminErrorBox>llm_prompts 테이블이 없습니다(253 SQL 미적용). 저장이 불가하며 코드 상수만 사용됩니다.</AdminErrorBox>
      )}
      {error && <AdminErrorBox>{error}</AdminErrorBox>}

      {groups.map(group => (
        <section key={group} className="space-y-3">
          <h3 className="text-sm font-semibold text-foreground">{group}</h3>
          {prompts.filter(p => p.group === group).map(item => {
            const draft = drafts[item.key] ?? ''
            const dirty = draft !== item.promptText
            const usingFallback = !item.saved

            return (
              <div key={item.key} className="rounded-xl border border-border bg-card p-4 space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground">{item.label}</p>
                    <p className="text-xs text-muted-foreground">
                      <code className="text-foreground/60">{item.key}</code> · {item.description}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {usingFallback
                      ? <span className="rounded-md bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">코드 기본값</span>
                      : <span className="rounded-md bg-brand-50 px-2 py-0.5 text-[11px] text-brand-700 dark:bg-brand-950/30 dark:text-brand-300">DB 저장됨</span>}
                    {dirty && <span className="rounded-md bg-amber-100 px-2 py-0.5 text-[11px] text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">변경됨</span>}
                  </div>
                </div>

                <textarea
                  value={draft}
                  onChange={(e) => setDrafts(prev => ({ ...prev, [item.key]: e.target.value }))}
                  rows={10}
                  spellCheck={false}
                  className="w-full rounded-lg border border-border bg-background p-3 font-mono text-xs leading-relaxed"
                />

                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => save(item)}
                    disabled={!dirty || savingKey === item.key || !tableApplied}
                    className="gap-1.5"
                  >
                    {savingKey === item.key ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                    {savedKey === item.key ? '저장됨 — 다음 생성부터 적용' : '저장'}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setDrafts(prev => ({ ...prev, [item.key]: item.fallback }))}
                    className="gap-1.5"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    코드 기본값으로
                  </Button>
                  {item.updatedAt && (
                    <span className="text-[11px] text-muted-foreground">
                      수정 {new Date(item.updatedAt).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}
                    </span>
                  )}
                </div>
              </div>
            )
          })}
        </section>
      ))}
    </div>
  )
}
