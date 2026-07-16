'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Wand2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import AdminErrorBox from '@/components/admin/ui/AdminErrorBox'

interface MatchCandidate {
  corpCode: string
  corpName: string
  listed: boolean
}

interface RegisteredItem {
  entityId: string
  name: string
  corpCode: string
  corpName: string
}

interface UnmatchedItem {
  entityId: string
  name: string
  candidates: MatchCandidate[]
}

interface ResolveResult {
  skipped: boolean
  message: string | null
  registeredCount: number
  unmatchedCount: number
  excludedCount: number
  alreadyMappedCount: number
  registered: RegisteredItem[]
  unmatched: UnmatchedItem[]
}

export default function CompanyDocumentDartResolver() {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<ResolveResult | null>(null)

  async function handleResolve() {
    setIsLoading(true)
    setError(null)
    setResult(null)
    try {
      const response = await fetch('/api/admin/company-documents/dart-corpcode/resolve', { method: 'POST' })
      if (!response.headers.get('content-type')?.includes('application/json')) {
        throw new Error('로그인이 만료되었습니다. 다시 로그인한 뒤 시도해주세요.')
      }
      const data = await response.json() as Partial<ResolveResult> & { error?: string }
      if (!response.ok) throw new Error(data.error ?? '자동해석을 실행하지 못했습니다.')
      const nextResult: ResolveResult = {
        skipped: data.skipped ?? false,
        message: data.message ?? null,
        registeredCount: data.registeredCount ?? 0,
        unmatchedCount: data.unmatchedCount ?? 0,
        excludedCount: data.excludedCount ?? 0,
        alreadyMappedCount: data.alreadyMappedCount ?? 0,
        registered: data.registered ?? [],
        unmatched: data.unmatched ?? [],
      }
      setResult(nextResult)
      if (!nextResult.skipped && nextResult.registeredCount > 0) router.refresh()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '자동해석 중 오류가 발생했습니다.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <section className="space-y-4 rounded-xl border border-border bg-card p-5">
      <div>
        <h2 className="text-sm font-semibold text-foreground">주요기업 DART 코드 자동해석</h2>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          큐레이션 주요기업(주요 기업·경쟁사 목록)의 이름을 DART 고유번호 전체목록과 대조해
          정확히 일치하는 기업만 자동으로 등록합니다. 글로벌·비상장 기업은 DART에 없어 제외되는 게 정상입니다.
        </p>
      </div>

      <Button type="button" onClick={handleResolve} disabled={isLoading} className="gap-1.5">
        {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
        {isLoading ? '해석 중...' : '주요기업 DART 코드 자동해석'}
      </Button>

      {error && <AdminErrorBox>{error}</AdminErrorBox>}

      {result && (
        <div className="space-y-4" aria-live="polite">
          {result.skipped ? (
            <div className="rounded-lg border border-border bg-background px-4 py-3 text-sm text-muted-foreground">
              {result.message ?? '환경 설정이 없어 자동해석을 실행하지 않았습니다.'}
            </div>
          ) : (
            <>
              <div className="flex flex-wrap gap-x-5 gap-y-1 rounded-lg border border-border bg-background px-4 py-3 text-sm text-foreground">
                <span>자동등록 <strong>{result.registeredCount}</strong>건</span>
                <span>미매칭 <strong>{result.unmatchedCount}</strong>건</span>
                <span>글로벌·비상장 제외 <strong>{result.excludedCount}</strong>건</span>
                <span className="text-muted-foreground">이미 매핑됨 {result.alreadyMappedCount}건</span>
              </div>

              {result.registered.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-xs font-medium text-muted-foreground">이번에 자동등록된 기업</p>
                  <div className="flex flex-wrap gap-1.5">
                    {result.registered.map((item) => (
                      <span
                        key={item.entityId}
                        className="rounded-full bg-positive-soft px-2.5 py-0.5 text-xs font-medium text-positive"
                        title={`${item.corpName} · ${item.corpCode}`}
                      >
                        {item.name}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {result.unmatched.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-xs font-medium text-muted-foreground">
                    미매칭 — 후보가 여럿이거나 확실하지 않아 자동 저장하지 않았습니다. 필요 시 355-A SQL 핸드오프로 직접 등록해주세요.
                  </p>
                  <div className="overflow-x-auto rounded-xl border border-border">
                    <table className="min-w-[560px] w-full border-collapse text-sm">
                      <thead>
                        <tr className="border-b border-border bg-muted text-left text-xs font-semibold text-muted-foreground">
                          <th className="px-4 py-2">주요기업</th>
                          <th className="px-4 py-2">DART 후보</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {result.unmatched.map((item) => (
                          <tr key={item.entityId}>
                            <td className="whitespace-nowrap px-4 py-2 font-medium text-foreground align-top">{item.name}</td>
                            <td className="px-4 py-2">
                              {item.candidates.length === 0 ? (
                                <span className="text-muted-foreground">후보 없음</span>
                              ) : (
                                <div className="flex flex-wrap gap-1.5">
                                  {item.candidates.map((candidate) => (
                                    <span
                                      key={candidate.corpCode}
                                      className="rounded-full border border-border bg-muted px-2.5 py-0.5 text-xs text-muted-foreground"
                                    >
                                      {candidate.corpName} · {candidate.corpCode}{candidate.listed ? ' · 상장' : ''}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </section>
  )
}
