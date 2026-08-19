'use client'

import { Trash2 } from 'lucide-react'
import AdminAppearanceSettings from '@/components/admin/AdminAppearanceSettings'
import AdminDataReset from '@/components/admin/AdminDataReset'
import LlmManager from '@/components/admin/LlmManager'
import McpTokenBoard from '@/components/admin/McpTokenBoard'
import OpsSettingsPanel from '@/components/admin/OpsSettingsPanel'
import SsoProviderManager from '@/components/admin/SsoProviderManager'
import TranslationStatusManager from '@/components/admin/TranslationStatusManager'
import AdminSectionHeader from '@/components/admin/ui/AdminSectionHeader'
import AdminTabShell from '@/components/admin/ui/AdminTabShell'

const SETTINGS_TABS = [
  { value: 'general', label: '공통' },
  { value: 'llm', label: 'AI 모델' },
  { value: 'api', label: '외부 API' },
  { value: 'mcp', label: 'MCP' },
  { value: 'sso', label: 'SSO' },
  { value: 'maintenance', label: '유지보수' },
]

function MaintenanceSettings() {
  return (
    <div>
      <AdminSectionHeader
        icon={Trash2}
        title="위험 구역 (Danger Zone)"
        hint="되돌릴 수 없는 삭제 작업입니다."
      />
      <details className="rounded-xl border-2 border-destructive/30 bg-destructive/5">
        <summary className="admin-card-title flex cursor-pointer select-none items-center gap-2 px-5 py-3 text-destructive">
          <Trash2 className="h-4 w-4 shrink-0" />
          위험 작업 펼치기 (수집 데이터 삭제·초기화)
        </summary>
        <div className="border-t border-destructive/20 p-5">
          <p className="admin-caption mb-4 text-destructive">
            ⚠️ 아래 작업은 되돌릴 수 없습니다. 삭제 전 반드시 대상 건수를 확인하세요.
          </p>
          <AdminDataReset />
        </div>
      </details>
    </div>
  )
}

function renderSettingsContent(activeTab: string) {
  switch (activeTab) {
    case 'llm':
      return <LlmManager />
    case 'api':
      return <TranslationStatusManager />
    case 'mcp':
      return <McpTokenBoard />
    case 'sso':
      return <SsoProviderManager />
    case 'maintenance':
      return <MaintenanceSettings />
    default:
      return (
        <div className="space-y-6">
          <AdminAppearanceSettings />
          <OpsSettingsPanel />
        </div>
      )
  }
}

export default function SystemSettingsHub() {
  return (
    <AdminTabShell
      tabs={SETTINGS_TABS}
      defaultTab="general"
      aria-label="시스템 설정"
      renderContent={renderSettingsContent}
    />
  )
}
