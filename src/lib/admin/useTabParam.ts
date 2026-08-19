'use client'

import { useCallback } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'

const EMPTY_RESET_PARAM_KEYS: readonly string[] = []

/** ?tab= 로 탭 상태를 관리한다. 기본값이면 파라미터를 지워 URL을 깨끗이 유지. history 오염 방지 위해 replace. */
export function useTabParam<T extends string>(
  validValues: readonly T[],
  defaultValue: T,
  paramKey = 'tab',
  resetParamKeys: readonly string[] = EMPTY_RESET_PARAM_KEYS,
): [T, (value: T) => void] {
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()

  const raw = searchParams.get(paramKey)
  const active = (raw && (validValues as readonly string[]).includes(raw) ? raw : defaultValue) as T

  const setActive = useCallback(
    (value: T) => {
      const params = new URLSearchParams(searchParams.toString())
      resetParamKeys.forEach((key) => params.delete(key))
      if (value === defaultValue) params.delete(paramKey)
      else params.set(paramKey, value)
      const qs = params.toString()
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
    },
    [searchParams, router, pathname, defaultValue, paramKey, resetParamKeys],
  )

  return [active, setActive]
}
