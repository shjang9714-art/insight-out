'use client'

import { useState } from 'react'
import { CheckCircle2, Loader2, Upload, X, XCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import AdminTable, { type AdminTableColumn } from '@/components/admin/ui/AdminTable'
import type {
  SourceImportFormat,
  SourceImportResponse,
  SourceImportRow,
} from '@/lib/sources/types'

interface SourceImportDialogProps {
  open: boolean
  onClose: () => void
  onImported: () => Promise<void> | void
}

const SAMPLE_TEXT = `name,type,rss_url,is_active,crawl_interval_minutes
테크 뉴스,news_site,https://example.com/feed.xml,true,720
유튜브 채널,youtube_channel,https://www.youtube.com/feeds/videos.xml?channel_id=UC123,false,1440`

export function SourceImportDialog({
  open,
  onClose,
  onImported,
}: SourceImportDialogProps) {
  const [text, setText] = useState('')
  const [format, setFormat] = useState<SourceImportFormat>('auto')
  const [result, setResult] = useState<SourceImportResponse | null>(null)
  const [resultMode, setResultMode] = useState<'validate' | 'commit' | null>(null)
  const [validatedInput, setValidatedInput] = useState<string | null>(null)
  const [validatedFormat, setValidatedFormat] = useState<SourceImportFormat | null>(null)
  const [loadingMode, setLoadingMode] = useState<'validate' | 'commit' | null>(null)
  const [error, setError] = useState<string | null>(null)

  if (!open) return null

  const requestImport = async (mode: 'validate' | 'commit') => {
    setLoadingMode(mode)
    setError(null)

    try {
      const response = await fetch('/api/admin/sources/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, format, mode }),
      })
      const data = (await response.json()) as SourceImportResponse & {
        error?: string
      }

      if (!response.ok) {
        throw new Error(data.error || '대량 등록 요청을 처리하지 못했습니다.')
      }

      setResult(data)
      setResultMode(mode)
      if (mode === 'validate') {
        setValidatedInput(text)
        setValidatedFormat(format)
      } else if (data.summary.success > 0) {
        await onImported()
      }
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : '대량 등록 중 오류가 발생했습니다.',
      )
    } finally {
      setLoadingMode(null)
    }
  }

  const handleTextChange = (value: string) => {
    setText(value)
    setResult(null)
    setResultMode(null)
    setValidatedInput(null)
    setValidatedFormat(null)
  }

  const handleFormatChange = (value: SourceImportFormat) => {
    setFormat(value)
    setResult(null)
    setResultMode(null)
    setValidatedInput(null)
    setValidatedFormat(null)
  }

  const canCommit = Boolean(
    result
    && resultMode === 'validate'
    && result.summary.success > 0
    && validatedInput === text
    && validatedFormat === format,
  )

  const resultColumns: AdminTableColumn<SourceImportRow>[] = [
    { key: 'index', header: '행', cell: (row) => row.index },
    { key: 'name', header: '이름', cell: (row) => row.name || '-' },
    { key: 'type', header: '유형', cell: (row) => row.type || '-' },
    { key: 'rss_url', header: 'RSS URL', width: 'max-w-md', cell: (row) => <span className="break-all font-mono text-xs">{row.rss_url || '-'}</span> },
    { key: 'is_active', header: '활성', cell: (row) => row.is_active ? '활성' : '비활성' },
    { key: 'crawl_interval_minutes', header: '주기(분)', cell: (row) => row.crawl_interval_minutes },
    {
      key: 'status',
      header: '상태',
      cell: (row) => row.status === 'success' ? (
        <span className="inline-flex items-center gap-1 text-positive">
          <CheckCircle2 className="size-4" />
          정상
        </span>
      ) : row.status === 'duplicate' ? (
        <span className="inline-flex items-center gap-1 text-amber-700">
          <XCircle className="size-4" />
          중복
        </span>
      ) : (
        <span className="inline-flex items-center gap-1 text-destructive">
          <XCircle className="size-4" />
          오류
        </span>
      ),
    },
    { key: 'message', header: '메시지', cell: (row) => <span className="text-muted-foreground">{row.message}</span> },
  ]

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="source-import-title"
    >
      <div className="flex max-h-[90vh] w-full max-w-6xl flex-col overflow-hidden rounded-xl border bg-background shadow-xl">
        <div className="flex items-start justify-between border-b p-6">
          <div>
            <h2 id="source-import-title" className="text-xl font-semibold">
              수집 소스 대량 등록
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              CSV 또는 TSV 텍스트로 최대 50개 소스를 검증한 뒤 등록합니다.
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onClose}
            disabled={loadingMode !== null}
            aria-label="닫기"
          >
            <X className="size-4" />
          </Button>
        </div>

        <div className="overflow-y-auto p-6">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_220px]">
            <div>
              <label htmlFor="source-import-text" className="text-sm font-medium">
                소스 목록
              </label>
              <textarea
                data-slot="textarea"
                id="source-import-text"
                value={text}
                onChange={(event) => handleTextChange(event.target.value)}
                placeholder={SAMPLE_TEXT}
                className="mt-2 min-h-52 w-full rounded-lg border bg-background p-3 font-mono text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                disabled={loadingMode !== null}
              />
            </div>
            <div>
              <label htmlFor="source-import-format" className="text-sm font-medium">
                입력 형식
              </label>
              <select
                id="source-import-format"
                value={format}
                onChange={(event) => {
                  handleFormatChange(event.target.value as SourceImportFormat)
                }}
                className="mt-2 h-10 w-full rounded-lg border bg-background px-3 text-sm"
                disabled={loadingMode !== null}
              >
                <option value="auto">자동 감지</option>
                <option value="csv">CSV</option>
                <option value="tsv">TSV</option>
              </select>
              <div className="mt-4 rounded-lg bg-muted p-4 text-xs leading-5 text-muted-foreground">
                <p className="font-medium text-foreground">지원 컬럼</p>
                <p>name, type, rss_url, is_active, crawl_interval_minutes</p>
                <p className="mt-2">
                  헤더가 없으면 위 순서로 읽습니다. type은 news_site 또는
                  youtube_channel만 지원합니다.
                </p>
              </div>
            </div>
          </div>

          {error && (
            <div className="mt-4 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          )}

          {result && (
            <div className="mt-6 space-y-4">
              <div className="flex flex-wrap gap-2">
                <Badge variant="secondary">전체 {result.rows.length}건</Badge>
                <Badge className="bg-positive text-white hover:opacity-90">
                  정상 {result.summary.success}건
                </Badge>
                <Badge variant="destructive">오류 {result.summary.error}건</Badge>
                <Badge variant="outline">중복 {result.summary.duplicate}건</Badge>
              </div>

              <AdminTable
                columns={resultColumns}
                rows={result.rows}
                rowKey={(row) => String(row.index)}
                minWidth="min-w-[900px]"
                state="idle"
              />
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t p-4">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={loadingMode !== null}
          >
            닫기
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => requestImport('validate')}
            disabled={!text.trim() || loadingMode !== null}
          >
            {loadingMode === 'validate' && <Loader2 className="size-4 animate-spin" />}
            미리보기/검증
          </Button>
          <Button
            type="button"
            onClick={() => requestImport('commit')}
            disabled={!canCommit || loadingMode !== null}
          >
            {loadingMode === 'commit' ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Upload className="size-4" />
            )}
            정상 항목만 등록
          </Button>
        </div>
      </div>
    </div>
  )
}
