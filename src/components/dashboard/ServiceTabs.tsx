'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

interface ServiceOption {
  id: string
  name: string
  icon: string | null
}

interface Props {
  activeService: string // UUID 또는 'all'
  onChange: (id: string) => void
}

export default function ServiceTabs({ activeService, onChange }: Props) {
  const [services, setServices] = useState<ServiceOption[]>([])

  useEffect(() => {
    const supabase = createClient()
    supabase
      .from('services')
      .select('id, name, icon')
      .order('order')
      .then(({ data }) => {
        if (data) setServices(data as ServiceOption[])
      })
  }, [])

  const selected = services.find((s) => s.id === activeService)
  const label = selected ? (selected.icon ? `${selected.icon} ${selected.name}` : selected.name) : '서비스'

  return (
    <select
      value={activeService === 'all' ? '' : activeService}
      onChange={(e) => onChange(e.target.value || 'all')}
      aria-label="서비스 선택"
      className="shrink-0 rounded-full border border-border bg-card py-1.5 pl-3 pr-7 text-sm font-medium text-muted-foreground transition-colors hover:border-brand-200 focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-100 disabled:opacity-60"
      disabled={services.length === 0}
      title={label}
    >
      <option value="">서비스 전체</option>
      {services.map((s) => (
        <option key={s.id} value={s.id}>
          {s.icon ? `${s.icon} ${s.name}` : s.name}
        </option>
      ))}
    </select>
  )
}
