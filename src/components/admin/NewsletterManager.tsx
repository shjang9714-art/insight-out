'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import {
  updateNewsletterSettings,
  sendNewsletterNow,
  getPreviewHtml,
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

interface Issue {
  id: string
  sent_on: string
  subject: string
  recipient_cnt: number
  status: string
  triggered_by: string
  created_at: string
}

interface Recipient {
  status: string
}

interface Props {
  initialSettings: {
    is_enabled: boolean
    send_hour_kst: number
    send_days: number[]
    card_count: number
    subject_tpl: string
    last_sent_on: string | null
  }
  initialIssues: Issue[]
}

export default function NewsletterManager({ initialSettings, initialIssues }: Props) {
  const [settings, setSettings] = useState(initialSettings)
  const [settingsStatus, setSettingsStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [settingsError, setSettingsError] = useState<string | null>(null)

  const [previewHtml, setPreviewHtml] = useState<string | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)

  const [sendStatus, setSendStatus] = useState<'idle' | 'sending'>('idle')
  const [sendResult, setSendResult] = useState<string | null>(null)

  const [issues] = useState<Issue[]>(initialIssues)
  const [selectedIssueId, setSelectedIssueId] = useState<string | null>(null)
  const [recipients, setRecipients] = useState<Recipient[]>([])
  const [recipientsLoading, setRecipientsLoading] = useState(false)

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

  const handlePreview = async () => {
    setPreviewLoading(true)
    const result = await getPreviewHtml()
    if ('error' in result && result.error) {
      alert(result.error)
    } else if ('html' in result) {
      setPreviewHtml(result.html ?? null)
    }
    setPreviewLoading(false)
  }

  const handleSendNow = async () => {
    if (!window.confirm('지금 바로 뉴스레터를 발송하시겠습니까?')) return
    setSendStatus('sending')
    setSendResult(null)

    const result = await sendNewsletterNow()
    if ('error' in result && result.error) {
      setSendResult(`오류: ${result.error}`)
    } else if ('skipped' in result && result.skipped) {
      setSendResult(`건너뜀: ${result.skipped}`)
    } else if ('sent' in result) {
      setSendResult(`발송 완료 — ${result.sent}명 성공, ${result.failed}명 실패`)
    }
    setSendStatus('idle')
  }

  const handleSelectIssue = async (issueId: string) => {
    if (selectedIssueId === issueId) {
      setSelectedIssueId(null)
      setRecipients([])
      return
    }
    setSelectedIssueId(issueId)
    setRecipientsLoading(true)

    const res = await fetch(`/api/admin/newsletter-recipients?issueId=${issueId}`)
    if (res.ok) {
      const data = await res.json()
      setRecipients(data)
    }
    setRecipientsLoading(false)
  }

  const openRate = (issueId: string) => {
    if (selectedIssueId !== issueId || recipients.length === 0) return null
    const opened = recipients.filter((r) => r.status === 'opened').length
    return `${opened}/${recipients.length} (${Math.round((opened / recipients.length) * 100)}%)`
  }

  return (
    <div className="space-y-6">
      {/* 발송 설정 */}
      <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
        <h2 className="mb-1 text-base font-semibold text-foreground">발송 설정</h2>
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
      </section>

      {/* 미리보기 + 수동 발송 */}
      <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
        <h2 className="mb-5 text-base font-semibold text-foreground">미리보기 / 수동 발송</h2>

        <div className="flex gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={handlePreview}
            disabled={previewLoading}
            className="flex-1 h-10"
          >
            {previewLoading ? '생성 중...' : '미리보기'}
          </Button>
          <Button
            type="button"
            onClick={handleSendNow}
            disabled={sendStatus === 'sending'}
            className="flex-1 h-10"
          >
            {sendStatus === 'sending' ? '발송 중...' : '지금 발송'}
          </Button>
        </div>

        {sendResult && (
          <p className={cn(
            'mt-3 rounded-lg px-3 py-2 text-sm',
            sendResult.startsWith('오류') ? 'bg-negative-soft text-negative' : 'bg-positive-soft text-positive'
          )}>
            {sendResult}
          </p>
        )}

        {previewHtml && (
          <div className="mt-4">
            <p className="mb-2 text-xs text-muted-foreground">미리보기 (실제 메일 렌더링)</p>
            <iframe
              srcDoc={previewHtml}
              className="w-full rounded-lg border border-border"
              style={{ height: '600px' }}
              title="뉴스레터 미리보기"
            />
          </div>
        )}
      </section>

      {/* 발송 이력 */}
      <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
        <h2 className="mb-5 text-base font-semibold text-foreground">발송 이력</h2>

        {issues.length === 0 ? (
          <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
            아직 발송 이력이 없습니다.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-xs text-muted-foreground">
                  <th className="pb-2 text-left font-medium">발송일</th>
                  <th className="pb-2 text-left font-medium">제목</th>
                  <th className="pb-2 text-center font-medium">수신자</th>
                  <th className="pb-2 text-center font-medium">상태</th>
                  <th className="pb-2 text-center font-medium">트리거</th>
                  <th className="pb-2 text-center font-medium">오픈율</th>
                </tr>
              </thead>
              <tbody>
                {issues.map((issue) => (
                  <>
                    <tr
                      key={issue.id}
                      onClick={() => handleSelectIssue(issue.id)}
                      className="cursor-pointer border-b border-border hover:bg-accent/50 transition-colors"
                    >
                      <td className="py-3 text-foreground">{issue.sent_on}</td>
                      <td className="py-3 text-foreground max-w-xs truncate">{issue.subject}</td>
                      <td className="py-3 text-center text-muted-foreground">{issue.recipient_cnt}</td>
                      <td className="py-3 text-center">
                        <span className={cn(
                          'rounded-full px-2 py-0.5 text-xs font-medium',
                          issue.status === 'sent' ? 'bg-positive-soft text-positive' :
                          issue.status === 'partial' ? 'bg-risk-soft text-risk' :
                          issue.status === 'failed' ? 'bg-negative-soft text-negative' :
                          'bg-muted text-muted-foreground'
                        )}>
                          {issue.status}
                        </span>
                      </td>
                      <td className="py-3 text-center text-muted-foreground text-xs">{issue.triggered_by}</td>
                      <td className="py-3 text-center text-muted-foreground text-xs">
                        {selectedIssueId === issue.id
                          ? recipientsLoading ? '...' : openRate(issue.id) ?? '-'
                          : '클릭해서 확인'}
                      </td>
                    </tr>
                  </>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
