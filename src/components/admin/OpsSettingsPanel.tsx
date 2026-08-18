'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { useAdminConfirm } from '@/components/admin/ui/AdminConfirm'

interface OpsSettingsResponse {
  brief_recipients?: string[]
  error?: string
}

export default function OpsSettingsPanel() {
  const confirm = useAdminConfirm()
  const [recipients, setRecipients] = useState('')
  const [currentRecipients, setCurrentRecipients] = useState<string[]>([])
  const [message, setMessage] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isLoaded, setIsLoaded] = useState(false)
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    const controller = new AbortController()

    async function load() {
      try {
        const response = await fetch('/api/admin/ops-settings', { signal: controller.signal })
        const data = await response.json() as OpsSettingsResponse
        if (!response.ok) throw new Error(data.error ?? '운영 설정을 불러오지 못했습니다.')
        const loadedRecipients = data.brief_recipients ?? []
        setCurrentRecipients(loadedRecipients)
        setRecipients(loadedRecipients.join(', '))
        setIsLoaded(true)
      } catch (error) {
        if (controller.signal.aborted) return
        setMessage(error instanceof Error ? error.message : '운영 설정을 불러오지 못했습니다.')
      } finally {
        if (!controller.signal.aborted) setIsLoading(false)
      }
    }

    void load()
    return () => controller.abort()
  }, [])

  async function save() {
    const nextRecipients = recipients.split(',').map((value) => value.trim()).filter(Boolean)
    if (currentRecipients.length > 0 && nextRecipients.length === 0) {
      const confirmed = await confirm({
        title: '브리프 수신자 전체 삭제',
        description: '현재 등록된 수신자를 모두 삭제하면 운영 브리프를 받을 사람이 없습니다.',
        targets: currentRecipients,
        confirmLabel: '모두 삭제',
        destructive: true,
      })
      if (!confirmed) return
    }

    setIsSaving(true)
    setMessage(null)
    try {
      const response = await fetch('/api/admin/ops-settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ brief_recipients: nextRecipients }) })
      const data = await response.json() as OpsSettingsResponse
      if (!response.ok) throw new Error(data.error ?? '저장에 실패했습니다.')
      const savedRecipients = data.brief_recipients ?? nextRecipients
      setCurrentRecipients(savedRecipients)
      setRecipients(savedRecipients.join(', '))
      setMessage('운영 설정을 저장했습니다.')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '저장에 실패했습니다.')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <section className="rounded-xl border border-border bg-card p-5">
      <h2 className="text-sm font-semibold">운영 설정</h2>
      <p className="mt-1 text-xs text-muted-foreground">브리프 수신자 이메일(쉼표 구분)</p>
      <input
        className="mt-3 w-full rounded border border-input bg-background px-3 py-2 text-sm"
        value={recipients}
        onChange={(event) => setRecipients(event.target.value)}
        placeholder="ops@example.com"
        disabled={isLoading || isSaving}
      />
      <Button
        className="mt-3"
        size="sm"
        onClick={() => { void save() }}
        disabled={!isLoaded || isSaving}
      >
        {isLoading ? '불러오는 중…' : isSaving ? '저장 중…' : '저장'}
      </Button>
      {message && <p className="mt-2 text-xs text-muted-foreground">{message}</p>}
    </section>
  )
}
