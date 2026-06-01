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

// ─── 상수 ────────────────────────────────────────────────────────────────────

const REPORT_CATEGORIES = [
  { value: '가트너',    label: '가트너 (Gartner)' },
  { value: 'KRG',      label: 'KRG' },
  { value: '웹인사이트', label: '웹인사이트' },
] as const
type ReportCategory = (typeof REPORT_CATEGORIES)[number]['value']

const ACCEPTED_EXTS = ['pdf', 'pptx', 'docx', 'xlsx']
const ACCEPT_ATTR   = '.pdf,.pptx,.docx,.xlsx'
const MAX_MB        = 50

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
  category:     '',
  author:       '',
  publishedAt:  '',
  sourceId:     '',
  summary:      '',
  isEditorPick: false,
}

// ─── 컴포넌트 ─────────────────────────────────────────────────────────────────

export default function ReportUploadForm() {
  const supabase = createClient()
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
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

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
      next.has(id) ? next.delete(id) : next.add(id)
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

      // 성공 → 폼 초기화
      setSuccess(true)
      clearFile()
      setForm(FORM_INIT)
      setServiceIds(new Set())
      setKeywords([])

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
        <CheckCircle className="mx-auto mb-4 h-12 w-12 text-green-500" />
        <h2 className="text-lg font-semibold text-gray-900 mb-1">업로드 완료</h2>
        <p className="text-sm text-gray-500 mb-6">
          리포트가 성공적으로 등록됐습니다.
        </p>
        <Button onClick={() => setSuccess(false)}>다른 파일 업로드</Button>
      </Card>
    )
  }

  // ── 메인 폼 ────────────────────────────────────────────────────────────────

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {error && (
        <div className="rounded-lg bg-red-50 border border-red-100 px-4 py-3 text-sm text-red-600">
          {error}
        </div>
      )}

      {/* ───────── 파일 ───────── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold text-gray-700">파일 선택</CardTitle>
        </CardHeader>
        <CardContent>
          {file ? (
            <div className="flex items-center gap-3 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
              <FileText className="h-8 w-8 shrink-0 text-brand-600" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-gray-900">{file.name}</p>
                <p className="text-xs text-gray-400">
                  {extLabel(file.name)} · {(file.size / 1024 / 1024).toFixed(1)} MB
                </p>
              </div>
              <button
                type="button"
                onClick={clearFile}
                className="shrink-0 rounded-full p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
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
                  : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50'
              )}
            >
              <Upload className={cn('h-8 w-8', isDragOver ? 'text-brand-600' : 'text-gray-300')} />
              <p className="text-sm font-medium text-gray-700">
                파일을 드래그하거나{' '}
                <span className="text-brand-600">클릭해서 선택</span>
              </p>
              <p className="text-xs text-gray-400">
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
          <CardTitle className="text-sm font-semibold text-gray-700">기본 정보</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* 제목 */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="title">
              제목 <span className="text-red-500">*</span>
            </Label>
            <Input
              id="title"
              value={form.title}
              onChange={(e) => setForm(p => ({ ...p, title: e.target.value }))}
              placeholder="리포트 제목을 입력해주세요"
            />
          </div>

          {/* 카테고리 + 발행일 */}
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="category">
                카테고리 <span className="text-red-500">*</span>
              </Label>
              <Select
                value={form.category}
                onValueChange={(v) => setForm(p => ({ ...p, category: v as ReportCategory }))}
              >
                <SelectTrigger id="category">
                  <SelectValue placeholder="선택" />
                </SelectTrigger>
                <SelectContent>
                  {REPORT_CATEGORIES.map(c => (
                    <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="publishedAt">
                발행일{' '}
                <span className="text-xs font-normal text-gray-400">(선택)</span>
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
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="author">
                저자/기관{' '}
                <span className="text-xs font-normal text-gray-400">(선택)</span>
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
                <span className="text-xs font-normal text-gray-400">(선택)</span>
              </Label>
              <Select
                value={form.sourceId}
                onValueChange={(v) => setForm(p => ({ ...p, sourceId: v }))}
              >
                <SelectTrigger id="sourceId">
                  <SelectValue placeholder={sources.length === 0 ? '출처 없음' : '선택'} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">없음</SelectItem>
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
              <span className="text-xs font-normal text-gray-400">(선택)</span>
            </Label>
            <textarea
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
              className="h-4 w-4 rounded border-gray-300 accent-[--color-brand-600]"
            />
            <span className="text-sm text-gray-700">에디터 픽으로 등록</span>
          </label>
        </CardContent>
      </Card>

      {/* ───────── 담당 서비스 ───────── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold text-gray-700">담당 서비스 태그</CardTitle>
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
                        : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300 hover:bg-gray-50'
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
          <CardTitle className="text-sm font-semibold text-gray-700">키워드 태그</CardTitle>
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
                  className="rounded-full p-0.5 hover:bg-gray-300"
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
