'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Inbox, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import AdminErrorBox from '@/components/admin/ui/AdminErrorBox'
import AdminEmptyState from '@/components/admin/ui/AdminEmptyState'
import EntityAutocomplete, { type EntityOption } from '@/components/admin/EntityAutocomplete'
import { COMPANY_DOC_TYPES } from '@/lib/company-docs/constants'
import type { CompanyDocumentType } from '@/lib/types'

export interface ReviewItem {
  contentId: string
  entityId: string | null
  entityName: string | null
  docType: string
  publishedOn: string | null
  title: string
  originalUrl: string | null
  summaryKo: string | null
}

interface Props {
  initialItems: ReviewItem[]
}

/**
 * 355-C ③ — 수집 검토함. 자동수집(DART/발견) + 사용자 업로드 중 검토대기 문서를
 * 승인·기업변경·유형변경·발행일수정·이전버전연결·제외·소스차단할 수 있다.
 */
export default function CompanyDocumentReviewInbox({ initialItems }: Props) {
  const router = useRouter()
  // approve/exclude는 즉시 목록에서 사라져야 하므로 낙관적으로 숨긴다. 그 외 편집(기업/유형/
  // 발행일/버전연결)은 router.refresh()가 내려주는 새 initialItems를 그대로 렌더 중 읽어
  // 반영한다 — items를 별도 state로 복제하면 prop 갱신과 동기화가 어긋난다(useEffect 안티패턴).
  const [removedIds, setRemovedIds] = useState<Set<string>>(new Set())
  const items = initialItems.filter((item) => !removedIds.has(item.contentId))
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [entityDraft, setEntityDraft] = useState<EntityOption | null>(null)
  const [linkVersionDraft, setLinkVersionDraft] = useState('')

  async function runAction(contentId: string, action: string, extra?: Record<string, unknown>) {
    setBusyId(contentId)
    setError(null)
    setNotice(null)
    try {
      const res = await fetch(`/api/admin/company-documents/review/${contentId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ...extra }),
      })
      const data = await res.json() as { ok?: boolean; message?: string; error?: string }
      if (!res.ok) throw new Error(data.error ?? '작업에 실패했습니다.')

      if (data.message) setNotice(data.message)

      if (action === 'approve' || action === 'exclude') {
        setRemovedIds((prev) => new Set(prev).add(contentId))
      }
      router.refresh()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '작업 중 오류가 발생했습니다.')
    } finally {
      setBusyId(null)
    }
  }

  function toggleExpanded(item: ReviewItem) {
    if (expandedId === item.contentId) {
      setExpandedId(null)
      return
    }
    setExpandedId(item.contentId)
    setEntityDraft(item.entityId && item.entityName ? { id: item.entityId, canonical_name: item.entityName } : null)
    setLinkVersionDraft('')
  }

  return (
    <section className="space-y-4 rounded-xl border border-border bg-card p-5">
      <div>
        <h2 className="text-sm font-semibold text-foreground">수집 검토함 (355-C ③)</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          자동수집(DART·발견)·사용자 업로드 중 검토대기 문서 {items.length}건. 승인해야 사용자 목록에 노출됩니다.
        </p>
      </div>

      {error && <AdminErrorBox onDismiss={() => setError(null)}>{error}</AdminErrorBox>}
      {notice && <p className="text-xs text-muted-foreground" aria-live="polite">{notice}</p>}

      {items.length === 0 ? (
        <AdminEmptyState icon={Inbox} message="검토대기 문서가 없습니다." className="border-dashed p-10" />
      ) : (
        <ul className="space-y-2">
          {items.map((item) => {
            const isBusy = busyId === item.contentId
            const isExpanded = expandedId === item.contentId
            return (
              <li key={item.contentId} className="rounded-lg border border-border p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                      <span className="rounded bg-muted px-1.5 py-0.5 font-medium">{item.docType}</span>
                      <span>{item.entityName ?? '미매칭'}</span>
                      {item.publishedOn && <span>· {item.publishedOn}</span>}
                    </div>
                    {item.originalUrl ? (
                      <a href={item.originalUrl} target="_blank" rel="noopener noreferrer" className="mt-1 block truncate text-sm font-medium text-foreground hover:text-brand-600 hover:underline">
                        {item.title}
                      </a>
                    ) : (
                      <p className="mt-1 truncate text-sm font-medium text-foreground">{item.title}</p>
                    )}
                    {item.summaryKo && <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{item.summaryKo}</p>}
                  </div>

                  <div className="flex shrink-0 flex-wrap gap-1.5">
                    <Button type="button" size="sm" disabled={isBusy} onClick={() => void runAction(item.contentId, 'approve')}>
                      {isBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null} 승인
                    </Button>
                    <Button type="button" size="sm" variant="outline" disabled={isBusy} onClick={() => toggleExpanded(item)}>
                      {isExpanded ? '닫기' : '편집'}
                    </Button>
                    <Button type="button" size="sm" variant="outline" disabled={isBusy} onClick={() => void runAction(item.contentId, 'exclude')}>
                      제외
                    </Button>
                    <Button type="button" size="sm" variant="outline" disabled={isBusy} onClick={() => void runAction(item.contentId, 'blockSource')}>
                      소스 차단
                    </Button>
                  </div>
                </div>

                {isExpanded && (
                  <div className="mt-4 grid grid-cols-1 gap-3 border-t border-border pt-4 sm:grid-cols-3">
                    <div className="space-y-1.5">
                      <p className="text-xs font-medium text-muted-foreground">기업 변경</p>
                      <EntityAutocomplete value={entityDraft} onChange={setEntityDraft} />
                      <Button type="button" size="sm" variant="outline" disabled={isBusy} onClick={() => void runAction(item.contentId, 'changeEntity', { entityId: entityDraft?.id ?? null })}>
                        기업 저장
                      </Button>
                    </div>

                    <div className="space-y-1.5">
                      <p className="text-xs font-medium text-muted-foreground">유형 변경</p>
                      <Select
                        defaultValue={item.docType}
                        onValueChange={(v) => void runAction(item.contentId, 'changeDocType', { docType: v as CompanyDocumentType })}
                      >
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {COMPANY_DOC_TYPES.map((type) => (
                            <SelectItem key={type} value={type}>{type}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-1.5">
                      <p className="text-xs font-medium text-muted-foreground">발행일 수정</p>
                      <Input
                        type="date"
                        defaultValue={item.publishedOn ?? ''}
                        onBlur={(event) => {
                          if (event.target.value) void runAction(item.contentId, 'changePublishedOn', { publishedOn: event.target.value })
                        }}
                      />
                    </div>

                    <div className="space-y-1.5 sm:col-span-3">
                      <p className="text-xs font-medium text-muted-foreground">이전 버전 연결(이전 문서의 content_id)</p>
                      <div className="flex gap-2">
                        <Input value={linkVersionDraft} onChange={(event) => setLinkVersionDraft(event.target.value)} placeholder="이전 버전 문서 ID" className="max-w-sm" />
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={isBusy || !linkVersionDraft.trim()}
                          onClick={() => void runAction(item.contentId, 'linkVersion', { prevContentId: linkVersionDraft.trim() })}
                        >
                          연결
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
