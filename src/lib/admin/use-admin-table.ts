'use client'

import { useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'

type Sort = { key: string; dir: 'asc' | 'desc' }

export function useAdminTable({ defaultSort, pageSize }: { defaultSort: Sort; pageSize: number }) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const parsedPage = Number.parseInt(searchParams.get('page') ?? '1', 10)
  const page = Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1
  const sort: Sort = {
    key: searchParams.get('sort') || defaultSort.key,
    dir: searchParams.get('dir') === 'asc' ? 'asc' : searchParams.get('dir') === 'desc' ? 'desc' : defaultSort.dir,
  }
  const scope = searchParams.toString()
  const [selectionState, setSelectionState] = useState<{ scope: string; selected: Set<string> }>(() => ({ scope, selected: new Set() }))
  const selected = selectionState.scope === scope ? selectionState.selected : new Set<string>()

  const navigate = (nextPage: number, nextSort: Sort) => {
    const params = new URLSearchParams(searchParams.toString())
    params.set('page', String(nextPage))
    params.set('sort', nextSort.key)
    params.set('dir', nextSort.dir)
    router.push(`${pathname}?${params.toString()}`)
  }

  const setPage = (nextPage: number) => {
    navigate(Math.max(1, nextPage), sort)
  }

  const toggleSort = (key: string) => {
    const nextSort: Sort = { key, dir: sort.key === key && sort.dir === 'asc' ? 'desc' : 'asc' }
    navigate(1, nextSort)
  }

  const setSelected = (next: Set<string>) => setSelectionState({ scope, selected: next })
  const resetSelection = () => setSelectionState({ scope, selected: new Set() })

  return { page, pageSize, sort, selected, setPage, toggleSort, setSelected, resetSelection }
}
