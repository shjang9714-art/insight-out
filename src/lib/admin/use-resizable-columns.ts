'use client'

import { startTransition, useEffect, useMemo, useState } from 'react'

export interface ResizableColumnDef {
  id: string
  defaultWidth: number
  minWidth: number
}

/**
 * 200 — 어드민 테이블 열 너비 드래그 리사이즈(라이브러리 없이 자체 pointer 이벤트).
 * SSR 가드: 초기 렌더는 항상 default 폭 → 마운트 후 localStorage 저장값으로 보정(hydration mismatch 0).
 */
export function useResizableColumns(columns: ResizableColumnDef[], storageKey: string) {
  const defaults = useMemo(
    () => Object.fromEntries(columns.map((c) => [c.id, c.defaultWidth])),
    [columns]
  )
  const minWidths = useMemo(
    () => Object.fromEntries(columns.map((c) => [c.id, c.minWidth])),
    [columns]
  )

  const [widths, setWidths] = useState<Record<string, number>>(defaults)

  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey)
      if (!raw) return
      const saved = JSON.parse(raw) as Record<string, number>
      startTransition(() => setWidths((prev) => ({ ...prev, ...saved })))
    } catch {
      // localStorage 접근·파싱 실패 — default 폭 유지
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function startResize(colId: string, e: React.PointerEvent) {
    e.preventDefault()
    e.stopPropagation()

    const startX = e.clientX
    const startWidth = widths[colId] ?? defaults[colId] ?? 100
    const min = minWidths[colId] ?? 40
    let latest = startWidth

    document.body.classList.add('select-none', 'cursor-col-resize')

    function onMove(ev: PointerEvent) {
      latest = Math.max(min, startWidth + (ev.clientX - startX))
      setWidths((prev) => ({ ...prev, [colId]: latest }))
    }

    function onUp() {
      document.removeEventListener('pointermove', onMove)
      document.removeEventListener('pointerup', onUp)
      document.body.classList.remove('select-none', 'cursor-col-resize')
      setWidths((prev) => {
        const next = { ...prev, [colId]: latest }
        try {
          localStorage.setItem(storageKey, JSON.stringify(next))
        } catch {
          // 저장 실패 — 이번 세션 내 폭만 반영
        }
        return next
      })
    }

    document.addEventListener('pointermove', onMove)
    document.addEventListener('pointerup', onUp)
  }

  function resetWidths() {
    setWidths(defaults)
    try {
      localStorage.removeItem(storageKey)
    } catch {
      // 삭제 실패 무시
    }
  }

  return { widths, startResize, resetWidths }
}
