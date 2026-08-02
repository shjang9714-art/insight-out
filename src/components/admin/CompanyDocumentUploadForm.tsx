'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { FileText, Loader2, Upload, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { renderPdfCover } from '@/lib/contents/pdf-cover'
import { uploadCover } from '@/lib/contents/upload-cover'
import { cn } from '@/lib/utils'
import AdminErrorBox from '@/components/admin/ui/AdminErrorBox'
import EntityAutocomplete, { type EntityOption } from '@/components/admin/EntityAutocomplete'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { COMPANY_DOC_TYPES } from '@/lib/company-docs/constants'
import type { CompanyDocumentType } from '@/lib/types'

const ACCEPTED_EXTENSIONS = ['pdf', 'pptx']
const MAX_FILE_SIZE = 50 * 1024 * 1024

function suggestedTitle(filename: string): string {
  return filename.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').trim()
}

/**
 * 355-C ② — 기업자료 수동 업로드 통(어드민). KnowledgeReportUploadForm과 동일한
 * 서명URL → Storage 업로드 → 메타데이터 저장 흐름을 기업자료 도메인에 맞춰 이식했다.
 */
export default function CompanyDocumentUploadForm() {
  const router = useRouter()
  const [supabase] = useState(createClient)
  const inputRef = useRef<HTMLInputElement>(null)

  const [file, setFile] = useState<File | null>(null)
  const [title, setTitle] = useState('')
  const [entity, setEntity] = useState<EntityOption | null>(null)
  const [docType, setDocType] = useState<CompanyDocumentType>('회사소개')
  const [isOfficial, setIsOfficial] = useState(false)
  const [publishedOn, setPublishedOn] = useState('')
  const [summary, setSummary] = useState('')
  const [immediatePublish, setImmediatePublish] = useState(false)
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

  const resetForm = () => {
    clearFile()
    setTitle('')
    setEntity(null)
    setDocType('회사소개')
    setIsOfficial(false)
    setPublishedOn('')
    setSummary('')
    setImmediatePublish(false)
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
        body: JSON.stringify({ filename: file.name, category: '기업자료' }),
      })
      const tokenData = await tokenResponse.json() as { token?: string; storagePath?: string; error?: string }
      if (!tokenResponse.ok || !tokenData.token || !tokenData.storagePath) {
        throw new Error(tokenData.error ?? '업로드 URL을 발급하지 못했습니다.')
      }

      const { error: uploadError } = await supabase.storage
        .from('reports')
        .uploadToSignedUrl(tokenData.storagePath, tokenData.token, file)
      if (uploadError) throw new Error(`파일 업로드 실패: ${uploadError.message}`)

      const metadataResponse = await fetch('/api/admin/company-documents/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entityId: entity?.id ?? null,
          title: title.trim(),
          docType,
          isOfficial,
          publishedOn: publishedOn || null,
          summary: summary.trim(),
          filePath: tokenData.storagePath,
          immediatePublish,
        }),
      })
      const metadata = await metadataResponse.json() as { contentId?: string; reviewStatus?: string; error?: string }
      if (!metadataResponse.ok || !metadata.contentId) {
        throw new Error(metadata.error ?? '기업자료 정보를 저장하지 못했습니다.')
      }

      const extension = file.name.split('.').pop()?.toLowerCase()
      let extractionNote = 'PPTX는 다운로드 방식으로 제공됩니다.'
      if (extension === 'pdf') {
        try {
          const cover = await renderPdfCover(file)
          if (cover) await uploadCover(supabase, metadata.contentId, cover, 'webp')
        } catch (coverError) {
          console.error('[company-documents/upload] PDF 표지 생성 실패:', coverError)
          secondaryErrors.push(`PDF 표지 생성 실패: ${coverError instanceof Error ? coverError.message : '알 수 없는 오류'}`)
        }
        try {
          const extractionResponse = await fetch(`/api/admin/contents/${metadata.contentId}/extract`, { method: 'POST' })
          const extraction = await extractionResponse.json() as { ok?: boolean; summarized?: boolean }
          extractionNote = extraction.ok
            ? `PDF 본문 추출 완료${extraction.summarized ? ' · 요약 자동 생성' : ''}`
            : 'PDF 등록 완료 · 본문 추출은 건너뛰었습니다.'
        } catch (extractionError) {
          console.error('[company-documents/upload] PDF 본문 추출 실패:', extractionError)
          secondaryErrors.push(`PDF 본문 추출 실패: ${extractionError instanceof Error ? extractionError.message : '알 수 없는 오류'}`)
          extractionNote = 'PDF 등록 완료 · 본문 추출은 나중에 다시 시도할 수 있습니다.'
        }
      }

      const successMessage =
        metadata.reviewStatus === 'none'
          ? `기업자료를 등록하고 즉시 공개했습니다. ${extractionNote}`
          : `기업자료를 검토대기로 등록했습니다. 검토함에서 승인해야 공개됩니다. ${extractionNote}`
      resetForm()
      toast.success(successMessage)
      if (secondaryErrors.length > 0) setError(secondaryErrors.join(' · '))
      router.refresh()
    } catch (uploadError) {
      console.error('[company-documents/upload] 업로드 실패:', uploadError)
      setError(uploadError instanceof Error ? uploadError.message : '업로드 중 오류가 발생했습니다.')
    } finally {
      setUploading(false)
    }
  }

  return (
    <section className="space-y-4 rounded-xl border border-border bg-card p-5">
      <div>
        <h2 className="text-sm font-semibold text-foreground">수동 업로드 통 (355-C ②)</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          저작권 게이트 — 원문 파일 저장은 공식 도메인·명시 승인분만 올려주세요. 기본은 링크·메타만 두는 것을 권장합니다.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        {error && <AdminErrorBox onDismiss={() => setError(null)}>{error}</AdminErrorBox>}

        <Card>
          <CardHeader><CardTitle>파일</CardTitle></CardHeader>
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
                  'flex w-full flex-col items-center gap-2 rounded-lg border-2 border-dashed py-10 text-center transition-colors',
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
          <CardHeader><CardTitle>문서 정보</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="cd-upload-title">제목</Label>
              <Input id="cd-upload-title" value={title} onChange={(event) => setTitle(event.target.value)} maxLength={300} required />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="cd-upload-entity">기업(선택 — 비워두면 미매칭으로 검토함에 남습니다)</Label>
                <EntityAutocomplete id="cd-upload-entity" value={entity} onChange={setEntity} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cd-upload-doctype">문서 유형</Label>
                <Select value={docType} onValueChange={(v) => setDocType(v as CompanyDocumentType)}>
                  <SelectTrigger id="cd-upload-doctype"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {COMPANY_DOC_TYPES.map((type) => (
                      <SelectItem key={type} value={type}>{type}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="cd-upload-published">발행일(선택)</Label>
              <Input id="cd-upload-published" type="date" value={publishedOn} onChange={(event) => setPublishedOn(event.target.value)} className="max-w-xs" />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="cd-upload-summary">요약(선택)</Label>
              <textarea
                id="cd-upload-summary"
                value={summary}
                onChange={(event) => setSummary(event.target.value)}
                maxLength={5000}
                placeholder="비워두면 PDF 본문 추출 결과로 요약 생성을 시도합니다."
                rows={3}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-brand-600 focus:ring-2 focus:ring-brand-100 dark:focus:ring-brand-950"
              />
            </div>

            <div className="flex flex-wrap gap-6">
              <label className="flex cursor-pointer items-center gap-2">
                <input type="checkbox" checked={isOfficial} onChange={(event) => setIsOfficial(event.target.checked)} className="h-4 w-4 rounded border-border accent-[--color-brand-600]" />
                <span className="text-sm text-foreground">공식 원문(저작권 확인됨)</span>
              </label>
              <label className="flex cursor-pointer items-center gap-2">
                <input type="checkbox" checked={immediatePublish} onChange={(event) => setImmediatePublish(event.target.checked)} className="h-4 w-4 rounded border-border accent-[--color-brand-600]" />
                <span className="text-sm text-foreground">즉시 공개(검토 없이)</span>
              </label>
            </div>
          </CardContent>
        </Card>

        <Button type="submit" disabled={isUploading} className="w-full sm:w-auto">
          {isUploading ? <Loader2 className="animate-spin" aria-hidden /> : <Upload aria-hidden />}
          {isUploading ? '업로드 중...' : '기업자료 등록'}
        </Button>
      </form>
    </section>
  )
}
