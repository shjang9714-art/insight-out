'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Search, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import AdminErrorBox from '@/components/admin/ui/AdminErrorBox'
import type { CompanyDocumentSourceKind, CompanyDocumentType } from '@/lib/types'

interface EntityOption {
  id: string
  canonical_name: string
}

interface Candidate {
  url: string
  title: string
  snippet?: string
  source_kind: CompanyDocumentSourceKind
  entity_hint?: string
  doc_type_hint?: CompanyDocumentType
  published_hint?: string
  provider: 'naver' | 'tavily'
}

interface QuotaInfo {
  used: number
  limit: number
}

interface Props {
  initialNaverQuota: QuotaInfo
  initialTavilyQuota: QuotaInfo
}

function quotaLabel(quota: QuotaInfo): string {
  return `${quota.used.toLocaleString()}/${quota.limit.toLocaleString()}`
}

export default function CompanyDocumentDiscovery({ initialNaverQuota, initialTavilyQuota }: Props) {
  const router = useRouter()

  // 기업 선택(자동완성) — 회사 엔티티만
  const [entityQuery, setEntityQuery] = useState('')
  const [entityOptions, setEntityOptions] = useState<EntityOption[]>([])
  const [selectedEntity, setSelectedEntity] = useState<EntityOption | null>(null)
  const [entitySearching, setEntitySearching] = useState(false)

  const [tavilyPrompt, setTavilyPrompt] = useState('')
  // 쿼터는 검색·저장 후 router.refresh()로 서버에서 다시 계산해 props로 받는다(낙관적 갱신 없음).
  const naverQuota = initialNaverQuota
  const tavilyQuota = initialTavilyQuota

  const [isSearching, setIsSearching] = useState<'naver' | 'tavily' | null>(null)
  const [searchError, setSearchError] = useState<string | null>(null)
  const [searchMessage, setSearchMessage] = useState<string | null>(null)
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [selectedUrls, setSelectedUrls] = useState<Set<string>>(new Set())

  const [isSaving, setIsSaving] = useState(false)
  const [saveResult, setSaveResult] = useState<{ savedCount: number; duplicateCount: number; failedCount: number } | null>(null)

  async function handleEntityQueryChange(value: string) {
    setEntityQuery(value)
    setSelectedEntity(null)
    if (value.trim().length < 1) {
      setEntityOptions([])
      return
    }
    setEntitySearching(true)
    try {
      const res = await fetch(`/api/entities/search?q=${encodeURIComponent(value.trim())}&type=company`)
      const data = await res.json() as { entities?: EntityOption[] }
      setEntityOptions(data.entities ?? [])
    } catch {
      setEntityOptions([])
    } finally {
      setEntitySearching(false)
    }
  }

  function entityNameForSearch(): string {
    return selectedEntity?.canonical_name ?? entityQuery.trim()
  }

  async function runSearch(provider: 'naver' | 'tavily') {
    const entityName = entityNameForSearch()
    if (!entityName) {
      setSearchError('기업명을 입력하거나 목록에서 선택해주세요.')
      return
    }
    if (provider === 'tavily' && !tavilyPrompt.trim()) {
      setSearchError('Tavily 탐색 프롬프트를 입력해주세요.')
      return
    }

    setIsSearching(provider)
    setSearchError(null)
    setSearchMessage(null)
    setSaveResult(null)
    try {
      const res = await fetch('/api/admin/company-documents/discover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entityName,
          provider,
          query: provider === 'tavily' ? tavilyPrompt.trim() : undefined,
        }),
      })
      if (!res.headers.get('content-type')?.includes('application/json')) {
        throw new Error('로그인이 만료되었습니다. 다시 로그인한 뒤 시도해주세요.')
      }
      const data = await res.json() as {
        candidates?: Candidate[]
        skipped?: boolean
        message?: string | null
        error?: string
      }
      if (!res.ok) throw new Error(data.error ?? '발견 검색을 실행하지 못했습니다.')

      setCandidates(data.candidates ?? [])
      setSelectedUrls(new Set((data.candidates ?? []).map((c) => c.url)))
      setSearchMessage(data.message ?? null)

      // 쿼터 표시는 즉시 반영되지 않을 수 있어(카운터 기록은 검색 이후) 페이지를 새로고침해 서버값과 동기화.
      router.refresh()
    } catch (caught) {
      setSearchError(caught instanceof Error ? caught.message : '발견 검색 중 오류가 발생했습니다.')
    } finally {
      setIsSearching(null)
    }
  }

  function toggleSelected(url: string) {
    setSelectedUrls((prev) => {
      const next = new Set(prev)
      if (next.has(url)) next.delete(url)
      else next.add(url)
      return next
    })
  }

  async function handleSave() {
    const toSave = candidates.filter((c) => selectedUrls.has(c.url))
    if (toSave.length === 0) {
      setSearchError('저장할 후보를 하나 이상 선택해주세요.')
      return
    }

    setIsSaving(true)
    setSearchError(null)
    try {
      const res = await fetch('/api/admin/company-documents/discover/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entityId: selectedEntity?.id ?? null, candidates: toSave }),
      })
      const data = await res.json() as {
        savedCount?: number
        duplicateCount?: number
        failedCount?: number
        error?: string
      }
      if (!res.ok) throw new Error(data.error ?? '후보 저장에 실패했습니다.')

      setSaveResult({
        savedCount: data.savedCount ?? 0,
        duplicateCount: data.duplicateCount ?? 0,
        failedCount: data.failedCount ?? 0,
      })
      setCandidates((prev) => prev.filter((c) => !selectedUrls.has(c.url)))
      setSelectedUrls(new Set())
      router.refresh()
    } catch (caught) {
      setSearchError(caught instanceof Error ? caught.message : '후보 저장 중 오류가 발생했습니다.')
    } finally {
      setIsSaving(false)
    }
  }

  const naverDisabled = isSearching !== null || naverQuota.used >= naverQuota.limit
  const tavilyDisabled = isSearching !== null || tavilyQuota.used >= tavilyQuota.limit

  return (
    <section className="space-y-4 rounded-xl border border-border bg-card p-5">
      <div>
        <h2 className="text-sm font-semibold text-foreground">기업자료 발견 커넥터 (355-F)</h2>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          네이버 검색·Tavily로 기업자료 <strong>후보</strong>를 찾습니다. 발견 결과는 원문이 아니라 후보이며
          전부 검토대기로 적재됩니다 — 자동 공개되지 않습니다.
        </p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="discovery-entity">기업 선택</Label>
        <div className="relative">
          <Input
            id="discovery-entity"
            value={entityQuery}
            onChange={(event) => handleEntityQueryChange(event.target.value)}
            placeholder="기업명을 입력하세요 (예: 퓨리오사AI)"
            autoComplete="off"
          />
          {!selectedEntity && entityQuery.trim().length > 0 && entityOptions.length > 0 && (
            <ul className="absolute z-10 mt-1 w-full rounded-lg border border-border bg-card shadow-md">
              {entityOptions.map((option) => (
                <li key={option.id}>
                  <button
                    type="button"
                    className="block w-full px-3 py-2 text-left text-sm hover:bg-accent"
                    onClick={() => {
                      setSelectedEntity(option)
                      setEntityQuery(option.canonical_name)
                      setEntityOptions([])
                    }}
                  >
                    {option.canonical_name}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        {selectedEntity ? (
          <p className="text-xs text-muted-foreground">
            선택됨: <strong className="text-foreground">{selectedEntity.canonical_name}</strong> — 등록 기업에 연결됩니다.
          </p>
        ) : entityQuery.trim() && !entitySearching ? (
          <p className="text-xs text-muted-foreground">
            일치하는 등록 기업이 없으면 미매칭 상태로 저장됩니다(검토함에서 나중에 연결).
          </p>
        ) : null}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2 rounded-lg border border-border p-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-foreground">네이버로 후보 찾기</p>
            <span className="text-xs text-muted-foreground">오늘 {quotaLabel(naverQuota)}</span>
          </div>
          <p className="text-xs text-muted-foreground">회사소개서·IR·기술백서·ESG 보고서 힌트로 자동 검색합니다.</p>
          <Button
            type="button"
            variant="outline"
            className="w-full gap-1.5"
            disabled={naverDisabled}
            onClick={() => runSearch('naver')}
          >
            {isSearching === 'naver' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            네이버로 후보 찾기
          </Button>
        </div>

        <div className="space-y-2 rounded-lg border border-border p-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-foreground">Tavily 정밀 탐색</p>
            <span className="text-xs text-muted-foreground">이번 달 {quotaLabel(tavilyQuota)}</span>
          </div>
          <textarea
            value={tavilyPrompt}
            onChange={(event) => setTavilyPrompt(event.target.value)}
            placeholder="예) 회사소개서·피치덱 위주로 찾아줘"
            rows={2}
            maxLength={300}
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-brand-600 focus:ring-2 focus:ring-brand-100 dark:focus:ring-brand-950"
          />
          <Button
            type="button"
            variant="outline"
            className="w-full gap-1.5"
            disabled={tavilyDisabled}
            onClick={() => runSearch('tavily')}
          >
            {isSearching === 'tavily' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            Tavily 정밀 탐색
          </Button>
        </div>
      </div>

      {searchError && <AdminErrorBox>{searchError}</AdminErrorBox>}
      {searchMessage && !searchError && (
        <p className="text-sm text-muted-foreground" aria-live="polite">{searchMessage}</p>
      )}

      {candidates.length > 0 && (
        <div className="space-y-3 rounded-lg border border-border bg-background p-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-foreground">발견된 후보 {candidates.length}건</p>
            <Button type="button" size="sm" onClick={handleSave} disabled={isSaving || selectedUrls.size === 0}>
              {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              선택 {selectedUrls.size}건 검토함으로
            </Button>
          </div>
          <ul className="max-h-96 space-y-2 overflow-y-auto">
            {candidates.map((candidate) => (
              <li key={candidate.url} className="flex items-start gap-2 rounded-lg border border-border p-3">
                <input
                  type="checkbox"
                  className="mt-1 h-4 w-4 shrink-0 accent-brand-600"
                  checked={selectedUrls.has(candidate.url)}
                  onChange={() => toggleSelected(candidate.url)}
                />
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                    <span className="rounded bg-muted px-1.5 py-0.5 font-medium">{candidate.provider}</span>
                    {candidate.doc_type_hint && (
                      <span className="rounded bg-muted px-1.5 py-0.5 font-medium">{candidate.doc_type_hint}</span>
                    )}
                  </div>
                  <a
                    href={candidate.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block truncate text-sm font-medium text-foreground hover:text-brand-600 hover:underline"
                  >
                    {candidate.title}
                  </a>
                  <p className="truncate text-xs text-muted-foreground">{candidate.url}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {saveResult && (
        <div className="rounded-lg border border-border bg-background px-4 py-3 text-sm text-foreground" aria-live="polite">
          <div className="flex flex-wrap gap-x-5 gap-y-1">
            <span>검토대기 저장 <strong>{saveResult.savedCount}</strong>건</span>
            <span>중복 <strong>{saveResult.duplicateCount}</strong>건</span>
            <span>실패 <strong>{saveResult.failedCount}</strong>건</span>
          </div>
        </div>
      )}
    </section>
  )
}
