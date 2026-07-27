'use client'

import { useState } from 'react'
import AdminTabShell from '@/components/admin/ui/AdminTabShell'
import NewsletterHistory from '@/components/admin/NewsletterHistory'
import NewsletterSendPanel from '@/components/admin/NewsletterSendPanel'
import NewsletterSettingsForm, { type NewsletterSettingsState } from '@/components/admin/NewsletterSettingsForm'

interface Issue {
  id: string
  sent_on: string
  subject: string
  recipient_cnt: number
  status: string
  triggered_by: string
  created_at: string
}

const TABS = [
  { value: 'history',  label: '발송 이력' },
  { value: 'send',     label: '미리보기·발송' },
  { value: 'settings', label: '발송 설정' },
]

interface Props {
  initialSettings: NewsletterSettingsState
  initialIssues: Issue[]
}

export default function NewsletterHub({ initialSettings, initialIssues }: Props) {
  // 400 §2.2 — settings만 탭 경계를 넘어 Hub에 둔다(편집 중 탭 이동 시 유실 방지).
  // send/history 상태는 각 탭 컴포넌트 내부에 둔다(서로 참조하지 않음, 언마운트 시 초기화 허용).
  const [settings, setSettings] = useState<NewsletterSettingsState>(initialSettings)
  const [settingsStatus, setSettingsStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [settingsError, setSettingsError] = useState<string | null>(null)

  return (
    <AdminTabShell
      tabs={TABS}
      defaultTab="history"
      aria-label="뉴스레터 관리"
      renderContent={(tab) =>
        tab === 'history'
          ? <NewsletterHistory initialIssues={initialIssues} />
          : tab === 'send'
            ? <NewsletterSendPanel />
            : (
              <NewsletterSettingsForm
                settings={settings}
                setSettings={setSettings}
                settingsStatus={settingsStatus}
                setSettingsStatus={setSettingsStatus}
                settingsError={settingsError}
                setSettingsError={setSettingsError}
              />
            )
      }
    />
  )
}
