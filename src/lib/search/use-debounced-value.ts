'use client'

import { useEffect, useState } from 'react'

/** 값이 delayMs 동안 더 바뀌지 않으면 반영 — 입력 중 자동 검색의 디바운스에 사용(D 스펙, 약 250~300ms). */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value)

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs)
    return () => clearTimeout(timer)
  }, [value, delayMs])

  return debounced
}
