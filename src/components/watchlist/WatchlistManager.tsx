'use client'

import { useState, useEffect } from 'react'
import { Search, X, Building2, Check } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

const MAX_WATCHLIST = 20

interface WatchlistRow {
  id: string
  company: string
  entity_id: string | null
}

interface SearchResult {
  id: string
  canonical_name: string
}

interface Props {
  /** 추가·삭제 등 목록이 바뀔 때마다 호출 — 호출부(서버 컴포넌트 등) 갱신용 */
  onChange?: () => void
}

export default function WatchlistManager({ onChange }: Props) {
  const [items, setItems] = useState<WatchlistRow[]>([])
  const [loading, setLoading] = useState(true)
  const [loaded, setLoaded] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // 최초 마운트 시 1회 로드(loaded 가드 — ArchiveButton 패턴)
  useEffect(() => {
    if (loaded) return

    const load = async () => {
      setLoading(true)
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setLoading(false); setLoaded(true); return }

      const { data, error: err } = await supabase
        .from('user_watchlist')
        .select('id, company, entity_id')
        .eq('user_id', user.id)
        .order('created_at', { ascending: true })
        .limit(MAX_WATCHLIST)

      if (err?.code === '42703') {
        // entity_id 컬럼 미적용(225 SQL 전) — company만 재조회, graceful
        const { data: fallback } = await supabase
          .from('user_watchlist')
          .select('id, company')
          .eq('user_id', user.id)
          .order('created_at', { ascending: true })
          .limit(MAX_WATCHLIST)
        setItems(((fallback ?? []) as { id: string; company: string }[]).map(r => ({ ...r, entity_id: null })))
      } else {
        setItems((data ?? []) as WatchlistRow[])
      }
      setLoaded(true)
      setLoading(false)
    }
    load()
  }, [loaded])

  // 검색 디바운스 250ms
  useEffect(() => {
    const q = query.trim()
    if (q.length < 1) return

    const timer = setTimeout(() => {
      const search = async () => {
        setSearching(true)
        try {
          const res = await fetch(`/api/entities/search?q=${encodeURIComponent(q)}&type=company`)
          const data = await res.json() as { entities?: SearchResult[] }
          setResults(data.entities ?? [])
        } catch {
          setResults([])
        } finally {
          setSearching(false)
        }
      }
      search()
    }, 250)
    return () => clearTimeout(timer)
  }, [query])

  async function insertWatchlist(company: string, entityId: string | null) {
    setError(null)
    const lower = company.toLowerCase()
    if (items.some(i => i.company.toLowerCase() === lower)) {
      setError(`'${company}'는 이미 등록되어 있습니다.`)
      return
    }
    if (items.length >= MAX_WATCHLIST) {
      setError(`관심기업은 최대 ${MAX_WATCHLIST}개까지 등록할 수 있습니다.`)
      return
    }

    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setError('로그인이 필요합니다.'); return }

    let inserted = await supabase
      .from('user_watchlist')
      .insert({ user_id: user.id, company, entity_id: entityId })
      .select('id, company, entity_id')
      .single()

    if (inserted.error?.code === '42703') {
      // entity_id 컬럼 미적용(225 SQL 전) — company만 저장, graceful
      inserted = await supabase
        .from('user_watchlist')
        .insert({ user_id: user.id, company })
        .select('id, company')
        .single()
    }

    if (inserted.error || !inserted.data) {
      setError('추가에 실패했습니다.')
      return
    }

    const row = inserted.data as { id: string; company: string; entity_id?: string | null }
    setItems(prev => [...prev, { id: row.id, company: row.company, entity_id: row.entity_id ?? null }])
    setQuery('')
    setResults([])
    onChange?.()
  }

  async function handleDelete(id: string) {
    setError(null)
    const supabase = createClient()
    const { error: delErr } = await supabase.from('user_watchlist').delete().eq('id', id)
    if (delErr) { setError('삭제에 실패했습니다.'); return }
    setItems(prev => prev.filter(i => i.id !== id))
    onChange?.()
  }

  const trimmedQuery = query.trim()
  const exactMatch = results.some(r => r.canonical_name.toLowerCase() === trimmedQuery.toLowerCase())

  return (
    <div className="space-y-3">
      {/* 현재 목록 */}
      <div className="flex flex-wrap gap-1.5 min-h-[42px] rounded-lg border border-border bg-background px-3 py-2">
        {loading ? (
          <span className="py-1 text-xs text-muted-foreground">불러오는 중...</span>
        ) : items.length === 0 ? (
          <span className="py-1 text-xs text-muted-foreground/60">아직 등록된 관심기업이 없습니다.</span>
        ) : (
          items.map(item => (
            <span
              key={item.id}
              className="inline-flex items-center gap-1 rounded-md bg-brand-600/10 px-2 py-0.5 text-xs font-medium text-brand-600"
            >
              {item.entity_id && <Check className="h-2.5 w-2.5" aria-label="기업 연결됨" />}
              {item.company}
              <button
                type="button"
                onClick={() => handleDelete(item.id)}
                className="ml-0.5 hover:text-brand-700"
                aria-label={`${item.company} 제거`}
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))
        )}
      </div>

      {/* 검색/추가 */}
      <div className="relative">
        <div className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 focus-within:ring-2 focus-within:ring-brand-600/30">
          <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground/50" />
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && trimmedQuery && !exactMatch) {
                e.preventDefault()
                insertWatchlist(trimmedQuery, null)
              }
            }}
            placeholder="회사명 검색 (예: 삼성전자, KT, AWS)"
            disabled={items.length >= MAX_WATCHLIST}
            className="flex-1 min-w-0 bg-transparent text-sm outline-none placeholder:text-muted-foreground/50"
          />
        </div>

        {trimmedQuery && (
          <div className="absolute z-10 mt-1.5 w-full overflow-hidden rounded-lg border border-border bg-card shadow-md">
            {searching ? (
              <p className="px-3 py-2 text-xs text-muted-foreground">검색 중...</p>
            ) : (
              <>
                {results.map(r => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => insertWatchlist(r.canonical_name, r.id)}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-foreground hover:bg-accent"
                  >
                    <Building2 className="h-3.5 w-3.5 shrink-0 text-brand-600" />
                    {r.canonical_name}
                  </button>
                ))}
                {!exactMatch && (
                  <button
                    type="button"
                    onClick={() => insertWatchlist(trimmedQuery, null)}
                    className="flex w-full items-center gap-2 border-t border-border px-3 py-2 text-left text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
                  >
                    &lsquo;{trimmedQuery}&rsquo; 직접 추가
                  </button>
                )}
              </>
            )}
          </div>
        )}
      </div>

      <p className="text-[11px] text-muted-foreground">
        검색해서 추가하면 관련 기사를 더 정확히 모아줍니다 · 목록에 없으면 직접 추가 가능 · 최대 {MAX_WATCHLIST}개
      </p>

      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  )
}
