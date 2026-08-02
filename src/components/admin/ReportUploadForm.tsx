'use client'

import { useState, useRef, useEffect } from 'react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { Upload, X, FileText, Loader2 } from 'lucide-react'
import { renderPdfCover } from '@/lib/contents/pdf-cover'
import { uploadCover } from '@/lib/contents/upload-cover'
import CoverImageField from '@/components/admin/CoverImageField'
import AdminErrorBox from '@/components/admin/ui/AdminErrorBox'
import KeywordTagInput from '@/components/admin/KeywordTagInput'

// ─── 상수 ────────────────────────────────────────────────────────────────────

type ReportCategory = '리포트'

const ACCEPTED_EXTS = ['pdf', 'pptx', 'docx', 'xlsx']
const ACCEPT_ATTR   = '.pdf,.pptx,.docx,.xlsx'
const MAX_MB        = 50
const EMPTY_SOURCE_VALUE = 'none'

// ─── 헬퍼 ────────────────────────────────────────────────────────────────────

/** 파일명에서 제목 제안 (확장자·특수문자 정리) */
function suggestTitle(filename: string): string {
  return filename
    .replace(/\.[^.]+$/, '')
    .replace(/[-_]+/g, ' ')
    .trim()
}

/** 확장자 → 표시 레이블 */
function extLabel(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() ?? ''
  const map: Record<string, string> = { pdf: 'PDF', pptx: 'PPT', docx: 'Word', xlsx: 'Excel' }
  return map[ext] ?? ext.toUpperCase()
}

// ─── 타입 ─────────────────────────────────────────────────────────────────────

interface Source {
  id: string
  name: string
}

interface FormState {
  title: string
  category: ReportCategory | ''
  author: string
  publishedAt: string
  sourceId: string
  summary: string
  isEditorPick: boolean
}

const FORM_INIT: FormState = {
  title:        '',
  category:     '리포트',
  author:       '',
  publishedAt:  '',
  sourceId:     '',
  summary:      '',
  isEditorPick: false,
}

// ─── 컴포넌트 ─────────────────────────────────────────────────────────────────

export default function ReportUploadForm() {
  const [supabase] = useState(createClient)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [sources, setSources]     = useState<Source[]>([])
  const [file, setFile]           = useState<File | null>(null)
  const [isDragOver, setIsDragOver] = useState(false)
  const [form, setForm]           = useState<FormState>(FORM_INIT)
  const [keywords, setKeywords]   = useState<string[]>([])
  const [isUploading, setIsUploading] = useState(false)
  const [error, setError]         = useState<string | null>(null)
  const [coverFile, setCoverFile] = useState<File | null>(null)

  // DB 메타데이터 로드
  useEffect(() => {
    const load = async () => {
      const { data: srcData } = await supabase
        .from('sources')
        .select('id, name')
        .eq('type', 'report_publisher')
        .order('name')
      if (srcData) setSources(srcData as Source[])
    }
    load()
  }, [supabase])

  // ── 파일 처리 ──────────────────────────────────────────────────────────────

  const acceptFile = (f: File) => {
    const ext = f.name.split('.').pop()?.toLowerCase() ?? ''
    if (!ACCEPTED_EXTS.includes(ext)) {
      setError('PDF, PPTX, DOCX, XLSX 파일만 업로드 가능합니다.')
      return
    }
    if (f.size > MAX_MB * 1024 * 1024) {
      setError(`파일 크기는 ${MAX_MB} MB 이하여야 합니다.`)
      return
    }
    setFile(f)
    setForm(prev => ({ ...prev, title: suggestTitle(f.name) }))
    setError(null)
  }

  const clearFile = () => {
    setFile(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
    const f = e.dataTransfer.files?.[0]
    if (f) acceptFile(f)
  }

  // ── 폼 유효성 검사 ─────────────────────────────────────────────────────────

  const validate = (): string | null => {
    if (!file)              return '파일을 선택해주세요.'
    if (!form.title.trim()) return '제목을 입력해주세요.'
    if (!form.category)     return '카테고리를 선택해주세요.'
    return null
  }

  // ── 업로드 실행 ────────────────────────────────────────────────────────────

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const validErr = validate()
    if (validErr) { setError(validErr); return }

    setIsUploading(true)
    setError(null)
    const secondaryErrors: string[] = []

    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('로그인 정보를 찾을 수 없습니다.')

      // ① 서버에서 서명된 업로드 URL 발급 (admin 확인 + service_role 키는 서버에서만 사용)
      const tokenRes = await fetch('/api/admin/upload', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ filename: file!.name, category: form.category }),
      })
      const tokenData: { token?: string; storagePath?: string; error?: string } =
        await tokenRes.json()
      if (!tokenRes.ok || !tokenData.token || !tokenData.storagePath) {
        throw new Error(tokenData.error ?? '업로드 URL 발급에 실패했습니다.')
      }
      const { token, storagePath } = tokenData

      // ② 서명된 토큰으로 Supabase Storage 에 직접 업로드 (파일이 Next.js 서버를 거치지 않음)
      const { error: storageErr } = await supabase.storage
        .from('reports')
        .uploadToSignedUrl(storagePath, token, file!)
      if (storageErr) {
        throw new Error(`파일 업로드 실패: ${storageErr.message}`)
      }

      // ② contents row 삽입
      const { data: contentRow, error: contentErr } = await supabase
        .from('contents')
        .insert({
          category:        form.category,
          source_id:       form.sourceId || null,
          title:           form.title.trim(),
          author:          form.author.trim()  || null,
          summary_ko:      form.summary.trim() || null,
          file_path:       storagePath,
          original_language: 'ko',
          status:          'published',
          is_editor_pick:  form.isEditorPick,
          published_at:    form.publishedAt || null,
        })
        .select('id')
        .single()
      if (contentErr) throw new Error(`콘텐츠 저장 실패: ${contentErr.message}`)
      const contentId = contentRow.id

      // ③ 키워드: 대소문자 무시 조회 → 없으면 생성 → content_keywords 연결
      if (keywords.length > 0) {
        const kwIds: string[] = []
        for (const kw of keywords) {
          const { data: existing } = await supabase
            .from('keywords')
            .select('id')
            .ilike('name', kw)
            .maybeSingle()

          if (existing) {
            kwIds.push(existing.id)
          } else {
            const { data: created, error: kwErr } = await supabase
              .from('keywords')
              .insert({ name: kw })
              .select('id')
              .single()
            if (kwErr) throw new Error(`키워드 저장 실패 (${kw}): ${kwErr.message}`)
            kwIds.push(created.id)
          }
        }

        const ckRows = kwIds.map(kid => ({ content_id: contentId, keyword_id: kid }))
        const { error: ckErr } = await supabase.from('content_keywords').insert(ckRows)
        if (ckErr) throw new Error(`키워드 연결 실패: ${ckErr.message}`)
      }

      // ⑤ 커버 이미지 — 우선순위: 사용자 지정 > PDF 자동 > (없음 → 렌더 시 기본 표지). 전부 graceful.
      if (coverFile) {
        try {
          const ext = coverFile.name.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg'
          await uploadCover(supabase, contentId, coverFile, ext)
        } catch (coverErr) {
          console.error('[upload] 커버 업로드 실패:', coverErr)
          secondaryErrors.push(`커버 업로드 실패: ${coverErr instanceof Error ? coverErr.message : '알 수 없는 오류'}`)
        }
      }

      // ⑥ PDF 본문 추출 (PDF만, 실패해도 업로드 성공 처리)
      const ext = file!.name.split('.').pop()?.toLowerCase() ?? ''
      if (ext === 'pdf') {
        try {
          const extractRes = await fetch(`/api/admin/contents/${contentId}/extract`, { method: 'POST' })
          await extractRes.json()
        } catch (extractErr) {
          console.error('[upload] 추출 호출 실패:', extractErr)
          secondaryErrors.push(`본문 추출 실패: ${extractErr instanceof Error ? extractErr.message : '알 수 없는 오류'}`)
        }

        // ⑦ 표지(1페이지) 자동 생성 — 사용자가 커버를 직접 지정하지 않았을 때만
        if (!coverFile) {
          try {
            const coverBlob = await renderPdfCover(file!)
            if (coverBlob) {
              await uploadCover(supabase, contentId, coverBlob, 'webp')
            }
          } catch (coverErr) {
            console.error('[upload] 표지 생성 실패:', coverErr)
            secondaryErrors.push(`표지 생성 실패: ${coverErr instanceof Error ? coverErr.message : '알 수 없는 오류'}`)
          }
        }
      }

      // 성공 → 폼 초기화
      clearFile()
      setForm(FORM_INIT)
      setKeywords([])
      setCoverFile(null)
      toast.success('리포트를 등록했습니다')
      if (secondaryErrors.length > 0) setError(secondaryErrors.join(' · '))

    } catch (err) {
      console.error('[admin/upload] error:', err)
      setError(err instanceof Error ? err.message : '업로드 중 오류가 발생했습니다.')
    } finally {
      setIsUploading(false)
    }
  }

  // ── 메인 폼 ────────────────────────────────────────────────────────────────

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {error && <AdminErrorBox>{error}</AdminErrorBox>}

      {/* ───────── 파일 ───────── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold text-foreground">파일 선택</CardTitle>
        </CardHeader>
        <CardContent>
          {file ? (
            <div className="flex items-center gap-3 rounded-xl border border-border bg-muted px-4 py-3">
              <FileText className="h-8 w-8 shrink-0 text-brand-600" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">{file.name}</p>
                <p className="text-xs text-muted-foreground">
                  {extLabel(file.name)} · {(file.size / 1024 / 1024).toFixed(1)} MB
                </p>
              </div>
              <button
                type="button"
                onClick={clearFile}
                className="shrink-0 rounded-full p-1 text-muted-foreground/40 hover:bg-accent hover:text-foreground"
                aria-label="파일 제거"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <div
              role="button"
              tabIndex={0}
              onClick={() => fileInputRef.current?.click()}
              onKeyDown={(e) => e.key === 'Enter' && fileInputRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setIsDragOver(true) }}
              onDragLeave={() => setIsDragOver(false)}
              onDrop={handleDrop}
              className={cn(
                'flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed py-10 transition-colors',
                isDragOver
                  ? 'border-brand-600 bg-brand-50'
                  : 'border-border bg-card hover:border-border hover:bg-accent/50'
              )}
            >
              <Upload className={cn('h-8 w-8', isDragOver ? 'text-brand-600' : 'text-muted-foreground/40')} />
              <p className="text-sm font-medium text-foreground">
                파일을 드래그하거나{' '}
                <span className="text-brand-600">클릭해서 선택</span>
              </p>
              <p className="text-xs text-muted-foreground">
                PDF · PPTX · DOCX · XLSX · 최대 {MAX_MB} MB
              </p>
            </div>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPT_ATTR}
            onChange={(e) => { const f = e.target.files?.[0]; if (f) acceptFile(f) }}
            className="hidden"
          />
        </CardContent>
      </Card>

      {/* ───────── 기본 정보 ───────── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold text-foreground">기본 정보</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* 제목 */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="title">
              제목 <span className="text-destructive">*</span>
            </Label>
            <Input
              id="title"
              value={form.title}
              onChange={(e) => setForm(p => ({ ...p, title: e.target.value }))}
              placeholder="리포트 제목을 입력해주세요"
            />
          </div>

          {/* 카테고리 + 발행일 */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="category">카테고리</Label>
              <div
                id="category"
                className="flex h-9 items-center rounded-lg border border-input bg-muted px-3 text-sm text-muted-foreground"
              >
                리포트
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="publishedAt">
                발행일{' '}
                <span className="text-xs font-normal text-muted-foreground">(선택)</span>
              </Label>
              <Input
                id="publishedAt"
                type="date"
                value={form.publishedAt}
                onChange={(e) => setForm(p => ({ ...p, publishedAt: e.target.value }))}
              />
            </div>
          </div>

          {/* 저자 + 출처 */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="author">
                저자/기관{' '}
                <span className="text-xs font-normal text-muted-foreground">(선택)</span>
              </Label>
              <Input
                id="author"
                value={form.author}
                onChange={(e) => setForm(p => ({ ...p, author: e.target.value }))}
                placeholder="예: Gartner Research"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="sourceId">
                출처{' '}
                <span className="text-xs font-normal text-muted-foreground">(선택)</span>
              </Label>
              <Select
                value={form.sourceId || EMPTY_SOURCE_VALUE}
                onValueChange={(v) => setForm(p => ({
                  ...p,
                  sourceId: v === EMPTY_SOURCE_VALUE ? '' : v,
                }))}
              >
                <SelectTrigger id="sourceId">
                  <SelectValue placeholder={sources.length === 0 ? '출처 없음' : '선택'} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={EMPTY_SOURCE_VALUE}>없음</SelectItem>
                  {sources.map(s => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* 요약 */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="summary">
              요약{' '}
              <span className="text-xs font-normal text-muted-foreground">(선택)</span>
            </Label>
            <textarea
              data-slot="textarea"
              id="summary"
              value={form.summary}
              onChange={(e) => setForm(p => ({ ...p, summary: e.target.value }))}
              placeholder="리포트 핵심 내용을 3~5줄로 작성해주세요"
              rows={3}
              className="w-full resize-none rounded-lg border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>

          {/* 에디터 픽 */}
          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              checked={form.isEditorPick}
              onChange={(e) => setForm(p => ({ ...p, isEditorPick: e.target.checked }))}
              className="h-4 w-4 rounded border-border accent-[--color-brand-600]"
            />
            <span className="text-sm text-foreground">에디터 픽으로 등록</span>
          </label>
        </CardContent>
      </Card>

      {/* ───────── 커버 이미지 ───────── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold text-foreground">커버 이미지</CardTitle>
        </CardHeader>
        <CardContent>
          <CoverImageField
            category="리포트"
            title={form.title}
            sourceName={sources.find(s => s.id === form.sourceId)?.name ?? null}
            value={coverFile}
            onChange={setCoverFile}
          />
        </CardContent>
      </Card>

      {/* ───────── 키워드 ───────── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold text-foreground">키워드 태그</CardTitle>
        </CardHeader>
        <CardContent>
          <KeywordTagInput
            value={keywords}
            onChange={setKeywords}
            title={form.title}
            snippet={form.summary}
            inputId="kw-input"
          />
        </CardContent>
      </Card>

      {/* ───────── 제출 ───────── */}
      <div className="flex justify-end pt-1">
        <Button
          type="submit"
          disabled={isUploading}
          className="min-w-[120px]"
        >
          {isUploading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              업로드 중...
            </>
          ) : (
            <>
              <Upload className="mr-2 h-4 w-4" />
              업로드
            </>
          )}
        </Button>
      </div>
    </form>
  )
}
