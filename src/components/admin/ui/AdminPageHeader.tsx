'use client'

import { usePathname } from 'next/navigation'
import { findAdminNavItem } from '@/lib/admin/nav'

interface Props {
  actions?: React.ReactNode
  titleOverride?: string
  descriptionOverride?: string
}

export default function AdminPageHeader({ actions, titleOverride, descriptionOverride }: Props) {
  const item = findAdminNavItem(usePathname())
  const Icon = item?.icon
  const title = titleOverride ?? item?.label ?? '어드민'
  const description = descriptionOverride ?? item?.description

  return (
    <div className="mb-6 flex items-start justify-between gap-4">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          {Icon && <Icon className="h-5 w-5 shrink-0 text-brand-600" />}
          <h1 className="text-2xl font-bold text-foreground">{title}</h1>
        </div>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="shrink-0">{actions}</div>}
    </div>
  )
}
