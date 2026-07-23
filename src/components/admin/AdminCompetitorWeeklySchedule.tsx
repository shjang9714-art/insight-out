'use client'

import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import AdminErrorBox from '@/components/admin/ui/AdminErrorBox'
import { cn } from '@/lib/utils'

interface ScheduleSettings {
  enabled: boolean
  generate_dow: number
  generate_hour: number
  auto_publish: boolean
}

const DOW_LABEL = ['일', '월', '화', '수', '목', '금', '토']

function Toggle({ checked, onChange, disabled }: { checked: boolean; onChange: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={onChange}
      className={cn(
        'relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-50',
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

function summaryText(s: ScheduleSettings): string {
  if (!s.enabled) return '자동 생성이 꺼져 있습니다.'
  return `매주 ${DOW_LABEL[s.generate_dow]}요일 ${String(s.generate_hour).padStart(2, '0')}시(KST) 생성 · ${s.auto_publish ? '자동 발행' : '초안으로 보관'}`
}

export default function AdminCompetitorWeeklySchedule() {
  const [settings, setSettings] = useState<ScheduleSettings | null>(null)
  const [ready, setReady] = useState(true)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    let isActive = true

    async function init() {
      try {
        const res = await fetch('/api/admin/competitor-weekly/settings', { cache: 'no-store' })
        const json = await res.json() as { settings: ScheduleSettings; ready: boolean; error?: string }
        if (!res.ok) throw new Error(json.error ?? '설정을 불러오지 못했습니다.')
        if (!isActive) return
        setSettings(json.settings)
        setReady(json.ready)
      } catch (err) {
        if (isActive) setError(err instanceof Error ? err.message : '설정을 불러오지 못했습니다.')
      } finally {
        if (isActive) setIsLoading(false)
      }
    }

    void init()
    return () => { isActive = false }
  }, [])

  const patch = (fields: Partial<ScheduleSettings>) => {
    setSettings((prev) => (prev ? { ...prev, ...fields } : prev))
    setSaved(false)
  }

  const handleSave = async () => {
    if (!settings) return
    setIsSaving(true)
    setError(null)
    setSaved(false)
    try {
      const res = await fetch('/api/admin/competitor-weekly/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      })
      const json = await res.json() as { settings: ScheduleSettings; error?: string }
      if (!res.ok) throw new Error(json.error ?? '저장에 실패했습니다.')
      setSettings(json.settings)
      setSaved(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : '저장 중 오류가 발생했습니다.')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="rounded-xl border border-border bg-card p-5 space-y-4">
      {isLoading ? (
        <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> 불러오는 중…
        </div>
      ) : !settings ? (
        <p className="text-sm text-muted-foreground">설정을 불러오지 못했습니다.</p>
      ) : (
        <>
          {!ready && (
            <p className="rounded-lg border border-dashed border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
              SQL 284(competitor_weekly_settings) 적용 전이라 기본값으로 표시됩니다. 적용 후 저장이 가능합니다.
            </p>
          )}
          {error && <AdminErrorBox onDismiss={() => setError(null)}>{error}</AdminErrorBox>}

          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-foreground">자동 생성</p>
              <p className="text-xs text-muted-foreground">꺼두면 크론이 돌아도 생성하지 않습니다.</p>
            </div>
            <Toggle checked={settings.enabled} onChange={() => patch({ enabled: !settings.enabled })} disabled={!ready} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-[11px] text-muted-foreground">요일(KST)</label>
              <Select
                value={String(settings.generate_dow)}
                onValueChange={(v) => patch({ generate_dow: Number(v) })}
                disabled={!ready}
              >
                <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {DOW_LABEL.map((label, i) => (
                    <SelectItem key={i} value={String(i)}>{label}요일</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-[11px] text-muted-foreground">시각(KST)</label>
              <Select
                value={String(settings.generate_hour)}
                onValueChange={(v) => patch({ generate_hour: Number(v) })}
                disabled={!ready}
              >
                <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 24 }, (_, h) => (
                    <SelectItem key={h} value={String(h)}>{String(h).padStart(2, '0')}시</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-foreground">자동 발행</p>
              <p className="text-xs text-muted-foreground">
                켜면 생성 즉시 서비스에 노출됩니다. 끄면 초안으로 두고 검토 후 직접 발행합니다.
              </p>
            </div>
            <Toggle checked={settings.auto_publish} onChange={() => patch({ auto_publish: !settings.auto_publish })} disabled={!ready} />
          </div>

          <p className="text-xs text-muted-foreground">{summaryText(settings)}</p>

          <div className="flex items-center gap-3">
            <Button type="button" size="sm" variant="brand" onClick={handleSave} disabled={isSaving || !ready}>
              {isSaving && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
              저장
            </Button>
            {saved && <span className="text-xs text-positive">저장됨</span>}
          </div>
        </>
      )}
    </div>
  )
}
