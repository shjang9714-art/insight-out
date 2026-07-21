'use client'

import type { Dispatch, SetStateAction } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import {
  updateNewsletterSettings,
  type NewsletterSettingsInput,
} from '@/app/admin/newsletter/actions'

const DAYS = [
  { iso: 1, label: '월' },
  { iso: 2, label: '화' },
  { iso: 3, label: '수' },
  { iso: 4, label: '목' },
  { iso: 5, label: '금' },
  { iso: 6, label: '토' },
  { iso: 7, label: '일' },
]

export interface NewsletterSettingsState {
  is_enabled: boolean
  send_hour_kst: number
  send_days: number[]
  card_count: number
  subject_tpl: string
  last_sent_on: string | null
}

type SettingsStatus = 'idle' | 'saving' | 'saved' | 'error'

interface Props {
  // 400 §2.2 — 편집 중 탭을 옮겨도 입력이 날아가면 안 되므로 이 상태는 Hub가 들고 있는다.
  settings: NewsletterSettingsState
  setSettings: Dispatch<SetStateAction<NewsletterSettingsState>>
  settingsStatus: SettingsStatus
  setSettingsStatus: Dispatch<SetStateAction<SettingsStatus>>
  settingsError: string | null
  setSettingsError: Dispatch<SetStateAction<string | null>>
}

export default function NewsletterSettingsForm({
  settings, setSettings, settingsStatus, setSettingsStatus, settingsError, setSettingsError,
}: Props) {
  const toggleDay = (iso: number) => {
    setSettings((prev) => ({
      ...prev,
      send_days: prev.send_days.includes(iso)
        ? prev.send_days.filter((d) => d !== iso)
        : [...prev.send_days, iso].sort(),
    }))
  }

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault()
    setSettingsError(null)
    setSettingsStatus('saving')

    const input: NewsletterSettingsInput = {
      is_enabled: settings.is_enabled,
      send_hour_kst: settings.send_hour_kst,
      send_days: settings.send_days,
      card_count: settings.card_count,
      subject_tpl: settings.subject_tpl,
    }

    const result = await updateNewsletterSettings(input)
    if ('error' in result && result.error) {
      setSettingsError(result.error)
      setSettingsStatus('error')
    } else {
      setSettingsStatus('saved')
      setTimeout(() => setSettingsStatus('idle'), 2500)
    }
  }

  return (
    <div>
      <p className="mb-5 text-xs text-amber-600 bg-amber-50 rounded-lg px-3 py-2">
        ⚠️ 현재 Hobby 플랜에서는 일 1회(08:00 KST) 고정 발송됩니다. 시각 설정은 Pro 전환 후 적용됩니다.
      </p>

      <form onSubmit={handleSaveSettings} className="flex flex-col gap-4">
        {/* on/off */}
        <div className="flex items-center justify-between rounded-xl border border-border p-4">
          <div>
            <p className="text-sm font-medium text-foreground">자동 발송</p>
            <p className="text-xs text-muted-foreground mt-0.5">매일 크론이 설정 요일에 자동 발송합니다.</p>
          </div>
          <button
            type="button"
            onClick={() => setSettings((s) => ({ ...s, is_enabled: !s.is_enabled }))}
            className={cn(
              'relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors',
              settings.is_enabled ? 'bg-blue-600' : 'bg-muted'
            )}
            role="switch"
            aria-checked={settings.is_enabled}
          >
            <span className={cn(
              'pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-sm transition-transform',
              settings.is_enabled ? 'translate-x-5' : 'translate-x-0'
            )} />
          </button>
        </div>

        {/* 발송 시각 */}
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="send-hour">발송 시각 (KST)</Label>
          <select
            id="send-hour"
            value={settings.send_hour_kst}
            onChange={(e) => setSettings((s) => ({ ...s, send_hour_kst: Number(e.target.value) }))}
            className="rounded-lg border border-border px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {Array.from({ length: 24 }, (_, i) => (
              <option key={i} value={i}>{String(i).padStart(2, '0')}:00</option>
            ))}
          </select>
        </div>

        {/* 발송 요일 */}
        <div className="flex flex-col gap-1.5">
          <Label>발송 요일</Label>
          <div className="flex gap-2">
            {DAYS.map((d) => {
              const selected = settings.send_days.includes(d.iso)
              return (
                <button
                  key={d.iso}
                  type="button"
                  onClick={() => toggleDay(d.iso)}
                  className={cn(
                    'flex h-9 w-9 items-center justify-center rounded-lg border text-sm font-medium transition-all',
                    selected
                      ? 'border-blue-500 bg-blue-50 text-blue-900'
                      : 'border-border bg-card text-muted-foreground hover:border-border'
                  )}
                >
                  {d.label}
                </button>
              )
            })}
          </div>
        </div>

        {/* 카드 수 */}
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="card-count">카드 수 (1~10)</Label>
          <Input
            id="card-count"
            type="number"
            min={1}
            max={10}
            value={settings.card_count}
            onChange={(e) => setSettings((s) => ({ ...s, card_count: Number(e.target.value) }))}
          />
        </div>

        {/* 제목 템플릿 */}
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="subject-tpl">제목 템플릿</Label>
          <p className="text-xs text-muted-foreground">{'{date}'} 는 발송일(YYYY-MM-DD)로 치환됩니다.</p>
          <Input
            id="subject-tpl"
            value={settings.subject_tpl}
            onChange={(e) => setSettings((s) => ({ ...s, subject_tpl: e.target.value }))}
            placeholder="Insight Out 뉴스레터 · {date}"
          />
        </div>

        {settingsError && <p className="text-xs text-negative">{settingsError}</p>}

        <Button type="submit" disabled={settingsStatus === 'saving'} className="w-full h-10">
          {settingsStatus === 'saving' ? '저장 중...' : settingsStatus === 'saved' ? '저장되었습니다!' : '설정 저장'}
        </Button>
      </form>
    </div>
  )
}
