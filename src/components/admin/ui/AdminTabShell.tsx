'use client'

import type { ReactNode } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'
import { findAdminNavLocation } from '@/lib/admin/nav'
import AdminPageHeader from '@/components/admin/ui/AdminPageHeader'
import AdminTabs, { type AdminTabItem } from '@/components/admin/ui/AdminTabs'
import { useTabParam } from '@/lib/admin/useTabParam'

const EMPTY_RESET_PARAM_KEYS: readonly string[] = []

interface Props {
  tabs: AdminTabItem[]
  defaultTab: string
  renderContent: (activeTab: string) => ReactNode
  actions?: ReactNode
  contextBar?: ReactNode
  titleOverride?: string
  descriptionOverride?: string
  resetParamKeys?: readonly string[]
  'aria-label'?: string
}

/** 어드민 대상 화면 표준 프레임: 브레드크럼 → 헤더 → 컨텍스트 바 → 탭(URL ?tab=) → 본문. */
export default function AdminTabShell({
  tabs, defaultTab, renderContent, actions, contextBar,
  titleOverride, descriptionOverride, resetParamKeys = EMPTY_RESET_PARAM_KEYS, 'aria-label': ariaLabel,
}: Props) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const loc = findAdminNavLocation(pathname, searchParams)
  const values = tabs.map(t => t.value)
  const [active, setActive] = useTabParam(values, defaultTab, 'tab', resetParamKeys)

  return (
    <div>
      {loc && (
        <nav aria-label="breadcrumb" className="admin-caption mb-2 flex items-center gap-1.5 text-muted-foreground">
          <span>{loc.group}</span>
          <span aria-hidden>/</span>
          <span className="text-foreground">{titleOverride ?? loc.item.label}</span>
        </nav>
      )}

      <AdminPageHeader actions={actions} titleOverride={titleOverride} descriptionOverride={descriptionOverride} />

      {contextBar}

      {tabs.length > 0 && (
        <div className="mb-6">
          <AdminTabs items={tabs} value={active} onChange={setActive} aria-label={ariaLabel} />
        </div>
      )}

      {renderContent(active)}
    </div>
  )
}
