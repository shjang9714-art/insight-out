'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

// ─── 타입 ──────────────────────────────────────────────────────────────────────

export type LensKey = 'mine' | 'watch' | 'all'

export interface LensContext {
  serviceIds: string[]
  serviceNames: string[]     // 담당 서비스명 (소문자 비교용)
  watchlist: string[]        // user_watchlist.company lower-cased (문자열 폴백)
  watchlistEntityIds: string[]  // user_watchlist.entity_id — 엔티티 연결(225, 정확 매칭용)
}

export interface LensTarget {
  serviceIds?: string[]      // 엔티티의 직접 service_id
  names?: string[]           // 매칭 후보 텍스트 (제목·canonical_name·키워드 등)
  isCompetitor?: boolean
  entityId?: string          // 엔티티 자신의 id — 있으면 watchlistEntityIds와 정확 매칭(225)
}

// ─── 프리셋 상수 ───────────────────────────────────────────────────────────────

export const LENS_PRESETS: Record<LensKey, { label: string; desc: string }> = {
  mine:  { label: '내 업무',   desc: '담당 서비스 관련만' },
  watch: { label: '내 관심사', desc: '관심 기업·토픽만' },
  all:   { label: '전체',      desc: '모든 콘텐츠 보기' },
}

// ─── 판정 함수 ─────────────────────────────────────────────────────────────────

export function matchesLens(key: LensKey, ctx: LensContext, t: LensTarget): boolean {
  if (key === 'all') return true

  if (key === 'mine') {
    // 엔티티 직접 service_id 매칭
    if (t.serviceIds?.length && ctx.serviceIds.length) {
      if (t.serviceIds.some(id => ctx.serviceIds.includes(id))) return true
    }
    // 이슈·인사이트: 서비스명 키워드로 텍스트 매칭
    if (t.names?.length && ctx.serviceNames.length) {
      const lowerNames = t.names.map(n => n.toLowerCase())
      return ctx.serviceNames.some(sn => {
        const snLower = sn.toLowerCase()
        return lowerNames.some(n => n.includes(snLower) || snLower.includes(n))
      })
    }
    return false
  }

  if (key === 'watch') {
    if (t.isCompetitor) return true
    // 엔티티 FK 정확 매칭(225) — 있으면 우선, 문자열 오탐 없음
    if (t.entityId && ctx.watchlistEntityIds.includes(t.entityId)) return true
    if (!ctx.watchlist.length || !t.names?.length) return false
    const lowerNames = t.names.map(n => n.toLowerCase())
    return ctx.watchlist.some(w =>
      lowerNames.some(n => n.includes(w) || w.includes(n))
    )
  }

  return false
}

export function lensScore(key: LensKey, ctx: LensContext, t: LensTarget): number {
  if (key === 'all') return 0
  if (!matchesLens(key, ctx, t)) return 0
  if (t.isCompetitor) return 3
  if (key === 'watch') return 2
  return 1
}

// ─── useLensContext (1회 fetch + 모듈 스코프 캐시) ─────────────────────────────

const EMPTY_CTX: LensContext = { serviceIds: [], serviceNames: [], watchlist: [], watchlistEntityIds: [] }

let cachedCtx: LensContext | null = null
let fetchPromise: Promise<LensContext> | null = null

async function loadLensContext(): Promise<LensContext> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return EMPTY_CTX

  const [servicesRes, watchlistRes] = await Promise.all([
    supabase
      .from('user_services')
      .select('service_id, services(id, name)')
      .eq('user_id', user.id),
    supabase
      .from('user_watchlist')
      .select('company, entity_id')
      .eq('user_id', user.id)
      .limit(20),
  ])

  type ServiceRow = { service_id: string; services: { id: string; name: string } | null }
  const rows = (servicesRes.data ?? []) as unknown as ServiceRow[]
  const serviceIds = rows.map(r => r.service_id)
  const serviceNames = rows.flatMap(r => r.services ? [r.services.name] : [])

  // entity_id 컬럼 미적용(225 SQL 전, 42703) — company만 재조회, graceful
  let watchlistRows: { company: string; entity_id?: string | null }[]
  if (watchlistRes.error?.code === '42703') {
    const { data: fallback } = await supabase
      .from('user_watchlist')
      .select('company')
      .eq('user_id', user.id)
      .limit(20)
    watchlistRows = (fallback ?? []) as { company: string }[]
  } else {
    watchlistRows = (watchlistRes.data ?? []) as { company: string; entity_id: string | null }[]
  }

  const watchlist = watchlistRows.map(w => w.company.toLowerCase())
  const watchlistEntityIds = watchlistRows
    .map(w => w.entity_id)
    .filter((id): id is string => Boolean(id))

  return { serviceIds, serviceNames, watchlist, watchlistEntityIds }
}

export function useLensContext(): LensContext {
  const [ctx, setCtx] = useState<LensContext>(cachedCtx ?? EMPTY_CTX)

  useEffect(() => {
    if (cachedCtx) return  // useState 초기값으로 이미 설정됨
    if (!fetchPromise) {
      fetchPromise = loadLensContext().then(c => { cachedCtx = c; return c })
    }
    let cancelled = false
    fetchPromise.then(c => { if (!cancelled) setCtx(c) })
    return () => { cancelled = true }
  }, [])

  return ctx
}

// ─── useActiveLens (localStorage io:lens + 이벤트 브로드캐스트) ────────────────

const STORAGE_KEY = 'io:lens'

export function useActiveLens(): [LensKey, (k: LensKey) => void] {
  const [lens, setLens] = useState<LensKey>(() => {
    if (typeof window === 'undefined') return 'all'
    return (localStorage.getItem(STORAGE_KEY) as LensKey) ?? 'all'
  })

  useEffect(() => {
    const handler = () => {
      setLens((localStorage.getItem(STORAGE_KEY) as LensKey) ?? 'all')
    }
    window.addEventListener('lens:changed', handler)
    return () => window.removeEventListener('lens:changed', handler)
  }, [])

  const setActiveLens = (k: LensKey) => {
    localStorage.setItem(STORAGE_KEY, k)
    window.dispatchEvent(new Event('lens:changed'))
    setLens(k)
  }

  return [lens, setActiveLens]
}
