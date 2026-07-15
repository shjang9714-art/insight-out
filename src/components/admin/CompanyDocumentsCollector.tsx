'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Database, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import AdminErrorBox from '@/components/admin/ui/AdminErrorBox'

export interface DartCompanyOption {
  corpCode: string
  corpName: string
  entityName: string
}

interface CollectResult {
  fetchedCount: number
  newCount: number
  duplicateCount: number
  unmatchedCount: number
  failedCount: number
  skipped: boolean
  message: string | null
}

interface Props {
  companies: DartCompanyOption[]
  defaultSince: string
  schemaReady: boolean
}

export default function CompanyDocumentsCollector({ companies, defaultSince, schemaReady }: Props) {
  const router = useRouter()
  const [corpCode, setCorpCode] = useState(companies[0]?.corpCode ?? '')
  const [since, setSince] = useState(defaultSince)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<CollectResult | null>(null)

  async function handleCollect() {
    if (!corpCode) {
      setError('수집할 기업을 선택해주세요.')
      return
    }
    if (!since) {
      setError('수집 시작일을 선택해주세요.')
      return
    }

    setIsLoading(true)
    setError(null)
    setResult(null)
    try {
      const response = await fetch('/api/admin/company-documents/dart', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ corpCode, since }),
      })
      if (!response.headers.get('content-type')?.includes('application/json')) {
        throw new Error('로그인이 만료되었습니다. 다시 로그인한 뒤 시도해주세요.')
      }
      const data = await response.json() as Partial<CollectResult> & { error?: string }
      if (!response.ok) throw new Error(data.error ?? 'DART 수집을 실행하지 못했습니다.')
      const nextResult: CollectResult = {
        fetchedCount: data.fetchedCount ?? 0,
        newCount: data.newCount ?? 0,
        duplicateCount: data.duplicateCount ?? 0,
        unmatchedCount: data.unmatchedCount ?? 0,
        failedCount: data.failedCount ?? 0,
        skipped: data.skipped ?? false,
        message: data.message ?? null,
      }
      setResult(nextResult)
      if (!nextResult.skipped) router.refresh()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'DART 수집 중 오류가 발생했습니다.')
    } finally {
      setIsLoading(false)
    }
  }

  const disabled = isLoading || !schemaReady || companies.length === 0

  return (
    <section className="space-y-4 rounded-xl border border-border bg-card p-5">
      <div>
        <h2 className="text-sm font-semibold text-foreground">DART 공시 수집</h2>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          등록된 기업의 정기공시와 주요사항보고서를 조회해 공식 원문 링크로 적재합니다.
          한 번에 최근 1년까지 수집할 수 있습니다.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-[minmax(220px,1fr)_180px_auto] sm:items-end">
        <div className="space-y-1.5">
          <Label htmlFor="dart-company">대상 기업</Label>
          <Select value={corpCode} onValueChange={setCorpCode} disabled={disabled}>
            <SelectTrigger id="dart-company" className="w-full">
              <SelectValue placeholder="기업 선택" />
            </SelectTrigger>
            <SelectContent>
              {companies.map((company) => (
                <SelectItem key={company.corpCode} value={company.corpCode}>
                  {company.entityName} · {company.corpCode}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="dart-since">수집 시작일</Label>
          <Input
            id="dart-since"
            type="date"
            value={since}
            onChange={(event) => setSince(event.target.value)}
            disabled={disabled}
          />
        </div>
        <Button type="button" onClick={handleCollect} disabled={disabled} className="gap-1.5">
          {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Database className="h-4 w-4" />}
          {isLoading ? '수집 중...' : 'DART 수집 실행'}
        </Button>
      </div>

      {companies.length === 0 && schemaReady && (
        <p className="text-sm text-muted-foreground">DART 고유번호가 연결된 기업이 없습니다.</p>
      )}
      {error && <AdminErrorBox>{error}</AdminErrorBox>}
      {result && (
        <div className="rounded-lg border border-border bg-background px-4 py-3 text-sm text-foreground" aria-live="polite">
          {result.skipped ? (
            <p>{result.message ?? '환경 설정이 없어 수집을 실행하지 않았습니다.'}</p>
          ) : (
            <div className="flex flex-wrap gap-x-5 gap-y-1">
              <span>조회 <strong>{result.fetchedCount}</strong>건</span>
              <span>신규 <strong>{result.newCount}</strong>건</span>
              <span>중복 <strong>{result.duplicateCount}</strong>건</span>
              <span>미매칭 <strong>{result.unmatchedCount}</strong>건</span>
              <span>실패 <strong>{result.failedCount}</strong>건</span>
              {result.message && <span className="text-negative">{result.message}</span>}
            </div>
          )}
        </div>
      )}
    </section>
  )
}
