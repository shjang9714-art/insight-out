'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
export * from './lens-core'
import {
  EMPTY_LENS_CONTEXT,
  loadLensContext,
  type LensContext,
  type LensKey,
} from './lens-core'

// ─── useLensContext (1회 fetch + 모듈 스코프 캐시) ─────────────────────────────

let cachedCtx: LensContext | null = null
let fetchPromise: Promise<LensContext> | null = null

async function loadClientLensContext(): Promise<LensContext> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return EMPTY_LENS_CONTEXT
  return loadLensContext(supabase, user.id)
}

export function useLensContext(): LensContext {
  const [ctx, setCtx] = useState<LensContext>(cachedCtx ?? EMPTY_LENS_CONTEXT)

  useEffect(() => {
    if (cachedCtx) return  // useState 초기값으로 이미 설정됨
    if (!fetchPromise) {
      fetchPromise = loadClientLensContext().then(c => { cachedCtx = c; return c })
    }
    let cancelled = false
    fetchPromise.then(c => { if (!cancelled) setCtx(c) })
    return () => { cancelled = true }
  }, [])

  return ctx
}

// ─── useActiveLens (localStorage io:lens + 이벤트 브로드캐스트) ────────────────

const STORAGE_KEY = 'io:lens'

function normalizeLens(value: string | null): LensKey {
  return value === 'watch' ? 'watch' : 'all'
}

export function useActiveLens(): [LensKey, (k: LensKey) => void] {
  const ctx = useLensContext()
  const [lens, setLens] = useState<LensKey>(() => {
    if (typeof window === 'undefined') return 'all'
    return normalizeLens(localStorage.getItem(STORAGE_KEY))
  })
  // localStorage에 값이 있었는지(= 사용자가 이미 이 기기에서 고른 값이 있는지) 추적.
  // 있으면 DB 기본값이 로드돼도 덮어쓰지 않는다(우선순위: localStorage > DB > 'all').
  const hasStoredRef = useRef(typeof window !== 'undefined' && localStorage.getItem(STORAGE_KEY) !== null)

  useEffect(() => {
    if (hasStoredRef.current) return
    setLens(ctx.defaultLens)
  }, [ctx.defaultLens])

  useEffect(() => {
    const handler = () => {
      hasStoredRef.current = true
      setLens(normalizeLens(localStorage.getItem(STORAGE_KEY)))
    }
    window.addEventListener('lens:changed', handler)
    return () => window.removeEventListener('lens:changed', handler)
  }, [])

  const setActiveLens = (k: LensKey) => {
    localStorage.setItem(STORAGE_KEY, k)
    hasStoredRef.current = true
    window.dispatchEvent(new Event('lens:changed'))
    setLens(k)
  }

  return [lens, setActiveLens]
}
