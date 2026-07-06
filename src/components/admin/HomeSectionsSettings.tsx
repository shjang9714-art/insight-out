'use client'

import { useEffect, useState } from 'react'
import { ArrowDown, ArrowUp, ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface SectionRow {
  key: string
  label: string
  description: string
  enabled: boolean
  sort_order: number
}

type Status = 'idle' | 'loading' | 'saving' | 'saved' | 'error'

function Toggle({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={onChange}
      className={cn(
        'relative h-6 w-11 shrink-0 rounded-full transition-colors',
        checked ? 'bg-brand-600' : 'bg-muted',
      )}
    >
      <span
        className={cn(
          'absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform',
          checked ? 'translate-x-[22px]' : 'translate-x-0.5',
        )}
      />
    </button>
  )
}

export default function HomeSectionsSettings() {
  const [sections, setSections] = useState<SectionRow[]>([])
  const [status, setStatus] = useState<Status>('loading')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch('/api/admin/homepage')
      .then((res) => res.json())
      .then((data: { sections?: SectionRow[]; error?: string }) => {
        if (cancelled) return
        if (data.sections) {
          setSections(data.sections)
          setStatus('idle')
        } else {
          setError(data.error ?? '불러오기에 실패했습니다.')
          setStatus('error')
        }
      })
      .catch(() => {
        if (!cancelled) {
          setError('불러오기에 실패했습니다.')
          setStatus('error')
        }
      })
    return () => {
      cancelled = true
    }
  }, [])

  const toggleEnabled = (key: string) => {
    setSections((prev) => prev.map((s) => (s.key === key ? { ...s, enabled: !s.enabled } : s)))
  }

  const move = (index: number, direction: -1 | 1) => {
    setSections((prev) => {
      const next = [...prev]
      const target = index + direction
      if (target < 0 || target >= next.length) return prev
      ;[next[index], next[target]] = [next[target], next[index]]
      return next
    })
  }

  const handleSave = async () => {
    if (!sections.some((s) => s.enabled)) {
      setError('최소 1개 섹션은 노출되어야 합니다.')
      setStatus('error')
      return
    }

    setStatus('saving')
    setError(null)

    const payload = {
      sections: sections.map((s, index) => ({
        key: s.key,
        enabled: s.enabled,
        sort_order: (index + 1) * 10,
      })),
    }

    try {
      const res = await fetch('/api/admin/homepage', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? '저장에 실패했습니다.')
        setStatus('error')
        return
      }
      setStatus('saved')
      setTimeout(() => setStatus('idle'), 2500)
    } catch {
      setError('저장 중 오류가 발생했습니다.')
      setStatus('error')
    }
  }

  if (status === 'loading') {
    return <p className="admin-body text-muted-foreground">불러오는 중...</p>
  }

  return (
    <div className="space-y-4">
      <ul className="divide-y divide-border rounded-xl bg-card ring-1 ring-foreground/10">
        {sections.map((section, index) => (
          <li key={section.key} className="flex items-center gap-4 px-4 py-3">
            <div className="flex shrink-0 flex-col gap-0.5">
              <button
                type="button"
                onClick={() => move(index, -1)}
                disabled={index === 0}
                className="rounded p-1 text-muted-foreground hover:bg-accent disabled:opacity-30"
                aria-label="위로 이동"
              >
                <ArrowUp className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => move(index, 1)}
                disabled={index === sections.length - 1}
                className="rounded p-1 text-muted-foreground hover:bg-accent disabled:opacity-30"
                aria-label="아래로 이동"
              >
                <ArrowDown className="h-4 w-4" />
              </button>
            </div>
            <div className="min-w-0 flex-1">
              <p className="admin-card-title text-foreground">{section.label}</p>
              <p className="admin-caption mt-0.5 text-muted-foreground">{section.description}</p>
            </div>
            <Toggle checked={section.enabled} onChange={() => toggleEnabled(section.key)} />
          </li>
        ))}
      </ul>

      {error && <p className="admin-caption text-negative">{error}</p>}

      <div className="flex items-center justify-between">
        <a
          href="/dashboard"
          target="_blank"
          rel="noreferrer"
          className="admin-caption inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
        >
          공개 홈 보기
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
        <Button onClick={handleSave} disabled={status === 'saving'}>
          {status === 'saving' ? '저장 중...' : status === 'saved' ? '저장됨' : '저장'}
        </Button>
      </div>
    </div>
  )
}
