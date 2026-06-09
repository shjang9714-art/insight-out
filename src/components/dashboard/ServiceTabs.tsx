'use client'

import { SERVICES } from './mock-data'

interface Props {
  activeService: string
  onChange: (id: string) => void
}

export default function ServiceTabs({ activeService, onChange }: Props) {
  return (
    <div className="flex items-center gap-1 overflow-x-auto scrollbar-hide">
      {SERVICES.map((service) => (
        <button
          key={service.id}
          onClick={() => onChange(service.id)}
          className={`shrink-0 rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
            activeService === service.id
              ? 'bg-brand-600 text-white'
              : 'bg-card text-muted-foreground border border-border hover:border-border hover:bg-accent'
          }`}
        >
          {service.label}
        </button>
      ))}
    </div>
  )
}
