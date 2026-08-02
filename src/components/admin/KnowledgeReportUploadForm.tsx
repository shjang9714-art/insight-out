'use client'

import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { FileText, Loader2, Upload, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { renderPdfCover } from '@/lib/contents/pdf-cover'
import { uploadCover } from '@/lib/contents/upload-cover'
import type { KnowledgeReportAdminItem } from '@/lib/knowledge-reports/admin'
import { cn } from '@/lib/utils'
import AdminErrorBox from '@/components/admin/ui/AdminErrorBox'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

const ACCEPTED_EXTENSIONS = ['pdf', 'pptx']
const MAX_FILE_SIZE = 50 * 1024 * 1024

interface KnowledgeReportUploadFormProps {
  disabled?: boolean
  onCreated: (report: KnowledgeReportAdminItem) => void
}

function suggestedTitle(filename: string): string {
  return filename.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').trim()
}

export default function KnowledgeReportUploadForm({ disabled, onCreated }: KnowledgeReportUploadFormProps) {
  const [supabase] = useState(createClient)
  const inputRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [title, setTitle] = useState('')
  const [summary, setSummary] = useState('')
  const [keywordInput, setKeywordInput] = useState('')
  const [keywords, setKeywords] = useState<string[]>([])
  const [isDragging, setDragging] = useState(false)
  const [isUploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const acceptFile = (nextFile: File) => {
    const extension = nextFile.name.split('.').pop()?.toLowerCase() ?? ''
    if (!ACCEPTED_EXTENSIONS.includes(extension)) {
      setError('PDF 또는 PPTX 파일만 업로드할 수 있습니다.')
      return
    }
    if (nextFile.size > MAX_FILE_SIZE) {
      setError('파일 크기는 50MB 이하여야 합니다.')
      return
    }
    setFile(nextFile)
    setTitle((current) => current || suggestedTitle(nextFile.name))
    setError(null)
  }

  const clearFile = () => {
    setFile(null)
    if (inputRef.current) inputRef.current.value = ''
  }

  const addKeyword = () => {
    const keyword = keywordInput.replace(/^#+/, '').trim().slice(0, 50)
    if (keyword && !keywords.includes(keyword) && keywords.length < 12) {
      setKeywords((current) => [...current, keyword])
    }
    setKeywordInput('')
  }

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!file) return setError('파일을 선택해주세요.')
    if (!title.trim()) return setError('제목을 입력해주세요.')

    setUploading(true)
    setError(null)
    const secondaryErrors: string[] = []

    try {
      const tokenResponse = await fetch('/api/admin/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: file.name, category: '지식보고서' }),
      })
      const tokenData = await tokenResponse.json() as {
        token?: string
        storagePath?: string
        error?: string
      }
      if (!tokenResponse.ok || !tokenData.token || !tokenData.storagePath) {
        throw new Error(tokenData.error ?? '업로드 URL을 발급하지 못했습니다.')
      }

      const { error: uploadError } = await supabase.storage
        .from('reports')
        .uploadToSignedUrl(tokenData.storagePath, tokenData.token, file)
      if (uploadError) throw new Error(`파일 업로드 실패: ${uploadError.message}`)

      const metadataResponse = await fetch('/api/admin/knowledge-reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          summary: summary.trim(),
          keywords,
          filePath: tokenData.storagePath,
          fileName: file.name,
        }),
      })
      const metadata = await metadataResponse.json() as {
        report?: KnowledgeReportAdminItem
        error?: string
      }
      if (!metadataResponse.ok || !metadata.report) {
        throw new Error(metadata.error ?? '지식보고서 정보를 저장하지 못했습니다.')
      }

      const extension = file.name.split('.').pop()?.toLowerCase()
      let extractionNote = 'PPTX는 다운로드 방식으로 제공됩니다.'
      if (extension === 'pdf') {
        try {
          const cover = await renderPdfCover(file)
          if (cover) await uploadCover(supabase, metadata.report.id, cover, 'webp')
        } catch (coverError) {
          console.error('[knowledge-reports] PDF 표지 생성 실패:', coverError)
          secondaryErrors.push(`PDF 표지 생성 실패: ${coverError instanceof Error ? coverError.message : '알 수 없는 오류'}`)
        }

        try {
          const extractionResponse = await fetch(
            `/api/admin/contents/${metadata.report.id}/extract`,
            { method: 'POST' },
          )
          const extraction = await extractionResponse.json() as { ok?: boolean; summarized?: boolean }
          extractionNote = extraction.ok
            ? `PDF 본문 추출 완료${extraction.summarized ? ' · 요약 자동 생성' : ''}`
            : 'PDF 등록 완료 · 본문 추출은 건너뛰었습니다.'
        } catch (extractionError) {
          console.error('[knowledge-reports] PDF 본문 추출 실패:', extractionError)
          secondaryErrors.push(`PDF 본문 추출 실패: ${extractionError instanceof Error ? extractionError.message : '알 수 없는 오류'}`)
          extractionNote = 'PDF 등록 완료 · 본문 추출은 나중에 다시 시도할 수 있습니다.'
        }
      }

      onCreated(metadata.report)
      clearFile()
      setTitle('')
      setSummary('')
      setKeywords([])
      setKeywordInput('')
      toast.success(`지식보고서를 등록했습니다. ${extractionNote}`)
      if (secondaryErrors.length > 0) setError(secondaryErrors.join(' · '))
    } catch (uploadError) {
      console.error('[knowledge-reports] 업로드 실패:', uploadError)
      setError(uploadError instanceof Error ? uploadError.message : '업로드 중 오류가 발생했습니다.')
    } finally {
      setUploading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {error && <AdminErrorBox>{error}</AdminErrorBox>}

      <Card>
        <CardHeader>
          <CardTitle>지식보고서 파일</CardTitle>
        </CardHeader>
        <CardContent>
          {file ? (
            <div className="flex items-center gap-3 rounded-lg border border-border bg-muted p-4">
              <FileText className="h-8 w-8 shrink-0 text-brand-600" aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">{file.name}</p>
                <p className="text-xs text-muted-foreground">{(file.size / 1024 / 1024).toFixed(1)}MB</p>
              </div>
              <Button type="button" variant="ghost" size="icon-sm" onClick={clearFile} aria-label="파일 제거">
                <X aria-hidden />
              </Button>
            </div>
          ) : (
            <button
              type="button"
              disabled={disabled}
              onClick={() => inputRef.current?.click()}
              onDragOver={(event) => { event.preventDefault(); setDragging(true) }}
              onDragLeave={() => setDragging(false)}
              onDrop={(event) => {
                event.preventDefault()
                setDragging(false)
                const droppedFile = event.dataTransfer.files[0]
                if (droppedFile) acceptFile(droppedFile)
              }}
              className={cn(
                'flex w-full flex-col items-center gap-2 rounded-lg border-2 border-dashed py-10 text-center transition-colors disabled:cursor-not-allowed disabled:opacity-50',
                isDragging ? 'border-brand-600 bg-brand-50 dark:bg-brand-950/30' : 'border-border hover:bg-accent/50',
              )}
            >
              <Upload className="h-8 w-8 text-muted-foreground" aria-hidden />
              <span className="text-sm font-medium text-foreground">파일을 끌어놓거나 클릭해서 선택</span>
              <span className="text-xs text-muted-foreground">PDF · PPTX · 최대 50MB</span>
            </button>
          )}
          <input
            ref={inputRef}
            type="file"
            accept=".pdf,.pptx,application/pdf,application/vnd.openxmlformats-officedocument.presentationml.presentation"
            className="hidden"
            onChange={(event) => {
              const selectedFile = event.target.files?.[0]
              if (selectedFile) acceptFile(selectedFile)
            }}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>보고서 정보</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="knowledge-title">제목</Label>
            <Input id="knowledge-title" value={title} onChange={(event) => setTitle(event.target.value)} maxLength={300} required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="knowledge-summary">요약(선택)</Label>
            <textarea
              id="knowledge-summary"
              value={summary}
              onChange={(event) => setSummary(event.target.value)}
              maxLength={5000}
              placeholder="비워두면 PDF 본문 추출 결과로 요약 생성을 시도합니다."
              rows={4}
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-brand-600 focus:ring-2 focus:ring-brand-100 dark:focus:ring-brand-950"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="knowledge-keyword">키워드(선택)</Label>
            <div className="flex gap-2">
              <Input
                id="knowledge-keyword"
                value={keywordInput}
                onChange={(event) => setKeywordInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault()
                    addKeyword()
                  }
                }}
                placeholder="키워드 입력 후 Enter"
              />
              <Button type="button" variant="outline" onClick={addKeyword}>추가</Button>
            </div>
            {keywords.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {keywords.map((keyword) => (
                  <button
                    key={keyword}
                    type="button"
                    onClick={() => setKeywords((current) => current.filter((item) => item !== keyword))}
                    className="rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground hover:text-foreground"
                    aria-label={`${keyword} 키워드 제거`}
                  >
                    #{keyword} ×
                  </button>
                ))}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Button type="submit" disabled={disabled || isUploading} className="w-full sm:w-auto">
        {isUploading ? <Loader2 className="animate-spin" aria-hidden /> : <Upload aria-hidden />}
        {isUploading ? '업로드 중...' : '지식보고서 등록'}
      </Button>
    </form>
  )
}
