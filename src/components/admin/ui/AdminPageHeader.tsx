'use client'

import { usePathname, useSearchParams } from 'next/navigation'
import { findAdminNavItem } from '@/lib/admin/nav'
import { findAdminPageHelp } from '@/lib/admin/help'
import InfoHelp from './InfoHelp'

interface Props {
  actions?: React.ReactNode
  titleOverride?: string
  descriptionOverride?: string
}

export default function AdminPageHeader({ actions, titleOverride, descriptionOverride }: Props) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const item = findAdminNavItem(pathname, searchParams)
  const help = findAdminPageHelp(pathname)
  const Icon = item?.icon
  const title = titleOverride ?? item?.label ?? '어드민'
  const description = descriptionOverride ?? item?.description

  return (
    <div className="mb-7 flex items-start justify-between gap-4">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          {Icon && <Icon className="h-5 w-5 shrink-0 text-brand-600" />}
          <h1 className="admin-page-title text-foreground">{title}</h1>
          {help && <InfoHelp copy={help} />}
        </div>
        {description && <p className="admin-page-desc mt-1 text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="shrink-0">{actions}</div>}
    </div>
  )
}
