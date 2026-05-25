'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { createClient } from '@/lib/supabase/client'
import type { OnboardingStep2, Service } from '@/lib/types'

interface Props {
  defaultValues: OnboardingStep2
  onNext: (data: OnboardingStep2) => void
  onBack: () => void
}

export default function Step2Services({ defaultValues, onNext, onBack }: Props) {
  const [services, setServices] = useState<Service[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set(defaultValues.service_ids))
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const supabase = createClient()
    supabase
      .from('services')
      .select('*')
      .order('order')
      .then(({ data }) => {
        if (data) setServices(data)
        setLoading(false)
      })
  }, [])

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onNext({ service_ids: Array.from(selected) })
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      <div>
        <p className="text-sm text-gray-600 mb-4">
          주로 담당하거나 관심 있는 서비스를 선택해주세요. 여러 개 선택 가능합니다.
        </p>

        {loading ? (
          <div className="grid grid-cols-2 gap-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-14 rounded-xl bg-gray-100 animate-pulse" />
            ))}
          </div>
        ) : services.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-8">등록된 서비스가 없습니다.</p>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {services.map((service) => {
              const isSelected = selected.has(service.id)
              return (
                <button
                  key={service.id}
                  type="button"
                  onClick={() => toggle(service.id)}
                  className={`flex flex-col gap-0.5 rounded-xl border p-3 text-left transition-all ${
                    isSelected
                      ? 'border-blue-500 bg-blue-50 text-blue-900'
                      : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  {service.icon && <span className="text-lg">{service.icon}</span>}
                  <span className="text-sm font-medium leading-tight">{service.name}</span>
                  {service.description && (
                    <span className="text-xs text-gray-400 line-clamp-1">{service.description}</span>
                  )}
                </button>
              )
            })}
          </div>
        )}
      </div>

      <div className="flex gap-3 mt-2">
        <Button type="button" variant="outline" onClick={onBack} className="flex-1 h-10">
          이전
        </Button>
        <Button type="submit" className="flex-1 h-10">
          다음
        </Button>
      </div>
    </form>
  )
}
