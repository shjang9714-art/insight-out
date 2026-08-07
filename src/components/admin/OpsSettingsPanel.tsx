'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'

export default function OpsSettingsPanel() {
  const [recipients, setRecipients] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  async function save() {
    const response = await fetch('/api/admin/ops-settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ brief_recipients: recipients.split(',').map((v) => v.trim()).filter(Boolean) }) })
    const data = await response.json() as { error?: string }
    setMessage(response.ok ? '운영 설정을 저장했습니다.' : data.error ?? '저장에 실패했습니다.')
  }
  return <section className="rounded-xl border border-border bg-card p-5"><h2 className="text-sm font-semibold">운영 설정</h2><p className="mt-1 text-xs text-muted-foreground">브리프 수신자 이메일(쉼표 구분)</p><input className="mt-3 w-full rounded border border-input bg-background px-3 py-2 text-sm" value={recipients} onChange={(e) => setRecipients(e.target.value)} placeholder="ops@example.com" /><Button className="mt-3" size="sm" onClick={() => { void save() }}>저장</Button>{message && <p className="mt-2 text-xs text-muted-foreground">{message}</p>}</section>
}
