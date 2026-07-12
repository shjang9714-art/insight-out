'use client'

import { useState, useRef, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { Upload, X, FileText, Loader2, CheckCircle } from 'lucide-react'
import type { Service } from '@/lib/types'
import { renderPdfCover } from '@/lib/contents/pdf-cover'
import { uploadCover } from '@/lib/contents/upload-cover'
import CoverImageField from '@/components/admin/CoverImageField'
import AdminErrorBox from '@/components/admin/ui/AdminErrorBox'

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

/** 표지 실패 사유 한글화(291) */
const COVER_REASON_LABEL: Record<string, string> = {
  render_failed:  '1페이지 렌더 실패',
  blank_page:     '1페이지가 비어 있음(스캔 PDF일 수 있음)',
  upload_failed:  '저장 실패',
  update_failed:  '저장 실패',
}
function coverReasonLabel(reason?: string): string {
  if (!reason) return '알 수 없는 오류'
  return COVER_REASON_LABEL[reason] ?? reason
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

  const [services, setServices]   = useState<Service[]>([])
  const [sources, setSources]     = useState<Source[]>([])
  const [file, setFile]           = useState<File | null>(null)
  const [isDragOver, setIsDragOver] = useState(false)
  const [form, setForm]           = useState<FormState>(FORM_INIT)
  const [serviceIds, setServiceIds] = useState<Set<string>>(new Set())
  const [keywords, setKeywords]   = useState<string[]>([])
  const [kwInput, setKwInput]     = useState('')
  const [isUploading, setIsUploading] = useState(false)
  const [error, setError]         = useState<string | null>(null)
  const [success, setSuccess]     = useState(false)
  const [extractResult, setExtractResult] = useState<{
    ok: boolean
    chars?: number
    lang?: string
    translated?: boolean
    summarized?: boolean
    entities?: number
    issues?: number
    reason?: string
    message?: string
    coverSet?: boolean
    coverReason?: string
  } | null>(null)
  const [coverGenerated, setCoverGenerated] = useState(false)
  const [coverFile, setCoverFile] = useState<File | null>(null)
  // 표지 결과 표시용(291) — coverFile은 성공 화면 렌더 전 초기화되므로 별도 보관.
  const [manualCoverUsed, setManualCoverUsed] = useState(false)

  // DB 메타데이터 로드
  useEffect(() => {
    const load = async () => {
      const [{ data: svcData }, { data: srcData }] = await Promise.all([
        supabase.from('services').select('id, name, icon, order').order('order'),
        supabase
          .from('sources')
          .select('id, name')
          .eq('type', 'report_publisher')
          .order('name'),
      ])
      if (svcData) setServices(svcData as Service[])
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
    setSuccess(false)
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

  // ── 서비스 태그 ────────────────────────────────────────────────────────────

  const toggleService = (id: string) => {
    setServiceIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  // ── 키워드 ─────────────────────────────────────────────────────────────────

  const commitKeyword = () => {
    const kw = kwInput.trim()
    if (kw && !keywords.includes(kw)) {
      setKeywords(prev => [...prev, kw])
    }
    setKwInput('')
  }

  const handleKwKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      commitKeyword()
    } else if (e.key === 'Backspace' && kwInput === '' && keywords.length > 0) {
      setKeywords(prev => prev.slice(0, -1))
    }
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
    setManualCoverUsed(false)

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

      // ③ content_services 삽입
      if (serviceIds.size > 0) {
        const rows = [...serviceIds].map(sid => ({ content_id: contentId, service_id: sid }))
        const { error: svcErr } = await supabase.from('content_services').insert(rows)
        if (svcErr) throw new Error(`서비스 태그 저장 실패: ${svcErr.message}`)
      }

      // ④ 키워드: 대소문자 무시 조회 → 없으면 생성 → content_keywords 연결
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
          setCoverGenerated(true)
          setManualCoverUsed(true)
        } catch (coverErr) {
          console.error('[upload] 커버 업로드 실패:', coverErr)
        }
      }

      // ⑥ PDF 본문 추출 (PDF만, 실패해도 업로드 성공 처리)
      const ext = file!.name.split('.').pop()?.toLowerCase() ?? ''
      if (ext === 'pdf') {
        try {
          const extractRes = await fetch(`/api/admin/contents/${contentId}/extract`, { method: 'POST' })
          const extractData = await extractRes.json()
          setExtractResult(extractData)
        } catch (extractErr) {
          console.error('[upload] 추출 호출 실패:', extractErr)
          setExtractResult({ ok: false, reason: 'fetch_error', message: '추출 요청 실패' })
        }

        // ⑦ 표지(1페이지) 자동 생성 — 사용자가 커버를 직접 지정하지 않았을 때만
        if (!coverFile) {
          try {
            const coverBlob = await renderPdfCover(file!)
            if (coverBlob) {
              await uploadCover(supabase, contentId, coverBlob, 'webp')
              setCoverGenerated(true)
            }
          } catch (coverErr) {
            console.error('[upload] 표지 생성 실패:', coverErr)
          }
        }
      }

      // 성공 → 폼 초기화
      setSuccess(true)
      clearFile()
      setForm(FORM_INIT)
      setServiceIds(new Set())
      setKeywords([])
      setCoverFile(null)

    } catch (err) {
      console.error('[admin/upload] error:', err)
      setError(err instanceof Error ? err.message : '업로드 중 오류가 발생했습니다.')
    } finally {
      setIsUploading(false)
    }
  }

  // ── 성공 화면 ──────────────────────────────────────────────────────────────

  if (success) {
    return (
      <Card className="max-w-md mx-auto text-center py-12 px-8">
        <CheckCircle className="mx-auto mb-4 h-12 w-12 text-positive" />
        <h2 className="text-lg font-semibold text-foreground mb-1">업로드 완료</h2>
        <p className="text-sm text-muted-foreground mb-4">
          리포트가 성공적으로 등록됐습니다.
        </p>

        {/* 추출 결과 */}
        {extractResult && (
          <div className={cn(
            'mb-6 rounded-lg border px-4 py-3 text-left text-sm',
            extractResult.ok
              ? 'border-positive/20 bg-positive-soft text-positive'
              : extractResult.reason === 'scanned'
                ? 'border-amber-100 bg-amber-50 text-amber-800'
                : 'border-muted bg-muted/50 text-muted-foreground'
          )}>
            {extractResult.ok ? (
              <div className="space-y-0.5">
                <p className="font-medium">본문 추출 완료</p>
                <p className="text-xs">
                  {extractResult.chars?.toLocaleString()}자
                  {extractResult.lang === 'en' && (extractResult.translated ? ' · 한국어 번역 완료' : ' · 번역 미적용')}
                  {extractResult.summarized ? ' · 요약 생성' : ''}
                  {(extractResult.issues ?? 0) > 0 ? ` · 이슈 ${extractResult.issues}건 연결` : ''}
                  {(extractResult.entities ?? 0) > 0 ? ` · 엔티티 ${extractResult.entities}건 연결` : ''}
                </p>
              </div>
            ) : extractResult.reason === 'scanned' ? (
              <div>
                <p className="font-medium">스캔 PDF 추정 — 텍스트 추출 실패</p>
                <p className="text-xs mt-0.5">OCR 처리가 필요합니다. 본문 없이 등록됐습니다.</p>
              </div>
            ) : (
              <p>본문 추출을 건너뜀 ({extractResult.reason ?? '비 PDF'})</p>
            )}
            {manualCoverUsed ? (
              <p className="mt-1.5 text-xs opacity-80">표지 직접 지정됨</p>
            ) : coverGenerated || extractResult.coverSet ? (
              <p className="mt-1.5 text-xs opacity-80">· 표지 자동 추출 완료</p>
            ) : (
              <p className="mt-1.5 text-xs text-amber-700">
                · 표지 자동 추출 실패({coverReasonLabel(extractResult.coverReason)}) — 콘텐츠 검수에서 표지를 직접 올려주세요
              </p>
            )}
          </div>
        )}

        <Button onClick={() => {
          setSuccess(false)
          setExtractResult(null)
          setCoverGenerated(false)
          setManualCoverUsed(false)
        }}>다른 파일 업로드</Button>
      </Card>
    )
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

      {/* ───────── 담당 서비스 ───────── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold text-foreground">담당 서비스 태그</CardTitle>
        </CardHeader>
        <CardContent>
          {services.length === 0 ? (
            <p className="text-sm text-muted-foreground">서비스 목록을 불러오는 중...</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {services.map(svc => {
                const selected = serviceIds.has(svc.id)
                return (
                  <button
                    key={svc.id}
                    type="button"
                    onClick={() => toggleService(svc.id)}
                    className={cn(
                      'flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition-all',
                      selected
                        ? 'border-brand-600 bg-brand-600 text-white'
                        : 'border-border bg-card text-foreground hover:border-border hover:bg-accent/50'
                    )}
                  >
                    {svc.icon && <span>{svc.icon}</span>}
                    <span>{svc.name}</span>
                  </button>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ───────── 키워드 ───────── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold text-foreground">키워드 태그</CardTitle>
        </CardHeader>
        <CardContent>
          {/* 태그 입력 박스 */}
          <div
            onClick={() => document.getElementById('kw-input')?.focus()}
            className="flex min-h-[44px] cursor-text flex-wrap items-center gap-2 rounded-lg border border-input bg-background px-3 py-2 focus-within:ring-2 focus-within:ring-ring"
          >
            {keywords.map(kw => (
              <Badge key={kw} variant="secondary" className="gap-1 pr-1 text-xs">
                {kw}
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setKeywords(prev => prev.filter(k => k !== kw)) }}
                  className="rounded-full p-0.5 hover:bg-accent"
                  aria-label={`${kw} 삭제`}
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
            <input
              id="kw-input"
              type="text"
              value={kwInput}
              onChange={(e) => setKwInput(e.target.value)}
              onKeyDown={handleKwKeyDown}
              onBlur={commitKeyword}
              placeholder={keywords.length === 0 ? 'Enter로 키워드 추가 (예: 클라우드, AI, 보안)' : ''}
              className="min-w-[160px] flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
          </div>
          <p className="mt-1.5 text-xs text-muted-foreground">
            Enter 또는 포커스 이탈 시 추가 · Backspace로 마지막 태그 삭제
          </p>
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
