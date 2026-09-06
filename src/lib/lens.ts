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

export function invalidateLensContext(): void {
  cachedCtx = null
  fetchPromise = null
  window.dispatchEvent(new Event('lens:context-changed'))
}

function getClientLensContext(): Promise<LensContext> {
  if (!fetchPromise) {
    fetchPromise = loadClientLensContext().then(c => { cachedCtx = c; return c })
  }
  return fetchPromise
}

async function loadClientLensContext(): Promise<LensContext> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return EMPTY_LENS_CONTEXT
  return loadLensContext(supabase, user.id)
}

export function useLensContext(): LensContext {
  const [ctx, setCtx] = useState<LensContext>(cachedCtx ?? EMPTY_LENS_CONTEXT)

  useEffect(() => {
    let cancelled = false
    const refresh = () => {
      getClientLensContext().then(c => { if (!cancelled) setCtx(c) })
    }

    if (!cachedCtx) refresh()
    const handleContextChanged = () => refresh()
    window.addEventListener('lens:context-changed', handleContextChanged)
    return () => {
      cancelled = true
      window.removeEventListener('lens:context-changed', handleContextChanged)
    }
  }, [])

  return ctx
}

// ─── useActiveLens (localStorage io:lens + 이벤트 브로드캐스트) ────────────────

const STORAGE_KEY = 'io:lens'

function normalizeLens(value: string | null): LensKey {
  return value === 'boost' || value === 'only' ? value : 'all'
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

// ─── useSelectedInterests (localStorage io:interest-selection + 이벤트 브로드캐스트) ──

const SELECTION_STORAGE_KEY = 'io:interest-selection'

function readSelection(): string[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(SELECTION_STORAGE_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : []
  } catch {
    return []
  }
}

export function useSelectedInterests(): [string[], (keys: string[]) => void] {
  const [selected, setSelected] = useState<string[]>(() => readSelection())

  useEffect(() => {
    const handler = () => setSelected(readSelection())
    window.addEventListener('lens:selection-changed', handler)
    return () => window.removeEventListener('lens:selection-changed', handler)
  }, [])

  const setSelectedInterests = (keys: string[]) => {
    localStorage.setItem(SELECTION_STORAGE_KEY, JSON.stringify(keys))
    window.dispatchEvent(new Event('lens:selection-changed'))
    setSelected(keys)
  }

  return [selected, setSelectedInterests]
}
