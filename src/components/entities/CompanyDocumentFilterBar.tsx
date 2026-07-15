'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { COMPANY_DOC_TYPES } from '@/lib/company-docs/constants'
import type { CompanyDocumentEntityOption } from '@/lib/company-docs/query'

const ALL = '__all__'

interface Props {
  entityOptions: CompanyDocumentEntityOption[]
}

/** 355-B — 기업동향 > 기업·기술 자료 탭 필터(기업·유형). URL 쿼리(entity/docType)로 상태 관리. */
export default function CompanyDocumentFilterBar({ entityOptions }: Props) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const entity = searchParams.get('entity') ?? ALL
  const docType = searchParams.get('docType') ?? ALL

  function updateParam(key: 'entity' | 'docType', value: string) {
    const params = new URLSearchParams(searchParams.toString())
    if (value === ALL) params.delete(key)
    else params.set(key, value)
    router.push(`/dashboard/entities?${params.toString()}`)
  }

  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      <Select value={entity} onValueChange={(v) => updateParam('entity', v)}>
        <SelectTrigger size="sm"><SelectValue placeholder="전체 기업" /></SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>전체 기업</SelectItem>
          {entityOptions.map((opt) => (
            <SelectItem key={opt.entityId} value={opt.entityId}>{opt.entityName}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={docType} onValueChange={(v) => updateParam('docType', v)}>
        <SelectTrigger size="sm"><SelectValue placeholder="전체 유형" /></SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>전체 유형</SelectItem>
          {COMPANY_DOC_TYPES.map((type) => (
            <SelectItem key={type} value={type}>{type}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
