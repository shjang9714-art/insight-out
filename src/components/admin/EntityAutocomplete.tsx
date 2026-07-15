'use client'

import { useState } from 'react'
import { Input } from '@/components/ui/input'

export interface EntityOption {
  id: string
  canonical_name: string
}

interface Props {
  id?: string
  value: EntityOption | null
  onChange: (entity: EntityOption | null) => void
  placeholder?: string
  disabled?: boolean
}

/**
 * 355-C — 기업 엔티티 검색 자동완성. CompanyDocumentDiscovery(355-F)의 패턴을
 * 재사용해 소스 레지스트리·업로드 통·검토함 3곳에서 공용으로 쓴다.
 */
export default function EntityAutocomplete({ id, value, onChange, placeholder, disabled }: Props) {
  const [query, setQuery] = useState(value?.canonical_name ?? '')
  const [options, setOptions] = useState<EntityOption[]>([])
  const [searching, setSearching] = useState(false)

  async function handleQueryChange(next: string) {
    setQuery(next)
    onChange(null)
    if (next.trim().length < 1) {
      setOptions([])
      return
    }
    setSearching(true)
    try {
      const res = await fetch(`/api/entities/search?q=${encodeURIComponent(next.trim())}&type=company`)
      const data = await res.json() as { entities?: EntityOption[] }
      setOptions(data.entities ?? [])
    } catch {
      setOptions([])
    } finally {
      setSearching(false)
    }
  }

  return (
    <div className="relative">
      <Input
        id={id}
        value={query}
        onChange={(event) => handleQueryChange(event.target.value)}
        placeholder={placeholder ?? '기업명을 입력하세요'}
        autoComplete="off"
        disabled={disabled}
      />
      {!value && query.trim().length > 0 && options.length > 0 && (
        <ul className="absolute z-10 mt-1 w-full rounded-lg border border-border bg-card shadow-md">
          {options.map((option) => (
            <li key={option.id}>
              <button
                type="button"
                className="block w-full px-3 py-2 text-left text-sm hover:bg-accent"
                onClick={() => {
                  onChange(option)
                  setQuery(option.canonical_name)
                  setOptions([])
                }}
              >
                {option.canonical_name}
              </button>
            </li>
          ))}
        </ul>
      )}
      {!value && query.trim() && !searching && options.length === 0 && (
        <p className="mt-1 text-xs text-muted-foreground">일치하는 등록 기업이 없습니다.</p>
      )}
    </div>
  )
}
