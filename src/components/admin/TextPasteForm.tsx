'use client'

import { useState, useEffect } from 'react'
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
import { Loader2, CheckCircle, Send } from 'lucide-react'
import MarkdownEditor from '@/components/admin/MarkdownEditor'
import CoverImageField from '@/components/admin/CoverImageField'
import AdminErrorBox from '@/components/admin/ui/AdminErrorBox'
import KeywordTagInput from '@/components/admin/KeywordTagInput'
import { uploadCover } from '@/lib/contents/upload-cover'

// ─── 상수 ────────────────────────────────────────────────────────────────────

type PasteCategory = '웹인사이트' | '뉴스' | '리포트'

const CATEGORIES: PasteCategory[] = ['웹인사이트', '뉴스', '리포트']

const CATEGORY_SOURCE_TYPE: Record<PasteCategory, string> = {
  웹인사이트: 'web_insight',
  뉴스:      'news_site',
  리포트:    'report_publisher',
}

const EMPTY_SOURCE_VALUE = 'none'

// ─── 타입 ─────────────────────────────────────────────────────────────────────

interface Source {
  id: string
  name: string
}

export interface FormState {
  category:     PasteCategory
  title:        string
  bodyText:     string
  originalUrl:  string
  summary:      string
  author:       string
  publishedAt:  string
  sourceId:     string
  /** URL 임포트에서 추출한 og:image — 커버 미리보기 초기값(215) */
  thumbnailUrl: string
}

const FORM_INIT: FormState = {
  category:     '웹인사이트',
  title:        '',
  bodyText:     '',
  originalUrl:  '',
  summary:      '',
  author:       '',
  publishedAt:  '',
  sourceId:     '',
  thumbnailUrl: '',
}

// ─── 컴포넌트 ─────────────────────────────────────────────────────────────────

interface Props {
  /** 프리필용 초기값(URL 임포트 등에서 사용). 없으면 현행과 동일한 빈 폼. */
  initialForm?: Partial<FormState>
}

export default function TextPasteForm({ initialForm }: Props = {}) {
  const [supabase] = useState(createClient)

  const [sources, setSources]       = useState<Source[]>([])
  const [form, setForm]             = useState<FormState>({ ...FORM_INIT, ...initialForm })
  const [keywords, setKeywords]     = useState<string[]>([])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError]           = useState<string | null>(null)
  const [success, setSuccess]       = useState(false)
  const [coverFile, setCoverFile]         = useState<File | null>(null)
  const [coverPreviewUrl, setCoverPreviewUrl] = useState(initialForm?.thumbnailUrl || '')

  // 카테고리 변경 시 출처 목록 재조회
  useEffect(() => {
    const sourceType = CATEGORY_SOURCE_TYPE[form.category]
    supabase
      .from('sources')
      .select('id, name')
      .eq('type', sourceType)
      .order('name')
      .then(({ data }) => {
        setSources(data ?? [])
        setForm(prev => ({ ...prev, sourceId: '' }))
      })
  }, [supabase, form.category])

  // ── 제출 ───────────────────────────────────────────────────────────────────

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.title.trim()) { setError('제목을 입력해주세요.'); return }
    if (!form.bodyText.trim()) { setError('본문을 입력해주세요.'); return }

    setIsSubmitting(true)
    setError(null)

    try {
      const res = await fetch('/api/admin/paste', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          category:     form.category,
          title:        form.title.trim(),
          bodyText:     form.bodyText,
          bodyMarkdown: form.bodyText,
          originalUrl:  form.originalUrl.trim() || null,
          summary:      form.summary.trim() || null,
          author:       form.author.trim() || null,
          publishedAt:  form.publishedAt || null,
          sourceId:     form.sourceId || null,
          keywords,
        }),
      })

      const data: { id?: string; error?: string } = await res.json()
      if (!res.ok) throw new Error(data.error ?? '등록에 실패했습니다.')

      // 커버 이미지 — 우선순위: 사용자 지정 > og:image 초기값 > (없음 → 기본 표지). 전부 graceful.
      if (data.id) {
        try {
          if (coverFile) {
            const ext = coverFile.name.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg'
            await uploadCover(supabase, data.id, coverFile, ext)
          } else if (coverPreviewUrl) {
            // 216 — 외부 URL을 그대로 저장(핫링크)하지 않고 서버에서 report-covers 로 복사
            try {
              const copyRes = await fetch('/api/admin/cover-from-url', {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify({ contentId: data.id, imageUrl: coverPreviewUrl }),
              })
              if (!copyRes.ok) throw new Error(`서버 복사 실패 (${copyRes.status})`)
            } catch (copyErr) {
              console.error('[paste] og:image 서버 복사 실패, 외부 URL로 폴백:', copyErr)
              await supabase.from('contents').update({ thumbnail_url: coverPreviewUrl }).eq('id', data.id)
            }
          }
        } catch (coverErr) {
          console.error('[paste] 커버 저장 실패:', coverErr)
        }
      }

      setSuccess(true)
      setForm(FORM_INIT)
      setKeywords([])
      setCoverFile(null)
      setCoverPreviewUrl('')
    } catch (err) {
      setError(err instanceof Error ? err.message : '등록 중 오류가 발생했습니다.')
    } finally {
      setIsSubmitting(false)
    }
  }

  // ── 성공 화면 ──────────────────────────────────────────────────────────────

  if (success) {
    return (
      <Card className="max-w-md mx-auto text-center py-12 px-8">
        <CheckCircle className="mx-auto mb-4 h-12 w-12 text-positive" />
        <h2 className="text-lg font-semibold text-foreground mb-1">등록 완료</h2>
        <p className="text-sm text-muted-foreground mb-6">
          콘텐츠가 성공적으로 등록됐습니다.
        </p>
        <Button onClick={() => setSuccess(false)}>계속 추가</Button>
      </Card>
    )
  }

  // ── 메인 폼 ────────────────────────────────────────────────────────────────

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {error && <AdminErrorBox>{error}</AdminErrorBox>}

      {/* ───────── 기본 정보 ───────── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold text-foreground">기본 정보</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* 카테고리 + 발행일 */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="category">카테고리</Label>
              <Select
                value={form.category}
                onValueChange={(v) => setForm(p => ({ ...p, category: v as PasteCategory }))}
              >
                <SelectTrigger id="category">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map(c => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
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

          {/* 제목 */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="title">
              제목 <span className="text-destructive">*</span>
            </Label>
            <Input
              id="title"
              value={form.title}
              onChange={(e) => setForm(p => ({ ...p, title: e.target.value }))}
              placeholder="콘텐츠 제목을 입력해주세요"
            />
          </div>

          {/* 저자 + 출처 */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="author">
                저자/발행처{' '}
                <span className="text-xs font-normal text-muted-foreground">(선택)</span>
              </Label>
              <Input
                id="author"
                value={form.author}
                onChange={(e) => setForm(p => ({ ...p, author: e.target.value }))}
                placeholder="예: AWS 코리아"
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

          {/* 원문 링크 */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="originalUrl">
              원문 링크{' '}
              <span className="text-xs font-normal text-muted-foreground">(선택)</span>
            </Label>
            <Input
              id="originalUrl"
              type="url"
              value={form.originalUrl}
              onChange={(e) => setForm(p => ({ ...p, originalUrl: e.target.value }))}
              placeholder="https://..."
            />
          </div>
        </CardContent>
      </Card>

      {/* ───────── 커버 이미지 ───────── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold text-foreground">커버 이미지</CardTitle>
        </CardHeader>
        <CardContent>
          <CoverImageField
            category={form.category}
            title={form.title}
            sourceName={sources.find(s => s.id === form.sourceId)?.name ?? null}
            value={coverFile}
            onChange={setCoverFile}
            previewUrl={coverPreviewUrl || null}
            onClearPreviewUrl={() => setCoverPreviewUrl('')}
          />
        </CardContent>
      </Card>

      {/* ───────── 본문 ───────── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold text-foreground">본문</CardTitle>
        </CardHeader>
        <CardContent>
          <MarkdownEditor
            value={form.bodyText}
            onChange={(v) => setForm(p => ({ ...p, bodyText: v }))}
            placeholder="본문을 붙여넣거나 직접 입력해주세요. 마크다운 서식을 사용할 수 있습니다."
          />
          <p className="mt-1.5 text-xs text-muted-foreground">
            서식 툴바로 마크다운을 작성하고 미리보기로 확인할 수 있습니다.
          </p>
        </CardContent>
      </Card>

      {/* ───────── 요약 ───────── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold text-foreground">요약</CardTitle>
        </CardHeader>
        <CardContent>
          <textarea
            data-slot="textarea"
            id="summary"
            value={form.summary}
            onChange={(e) => setForm(p => ({ ...p, summary: e.target.value }))}
            placeholder="비우면 AI가 자동 요약합니다"
            rows={3}
            className="w-full resize-none rounded-lg border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <p className="mt-1.5 text-xs text-muted-foreground">
            비워두면 AI가 본문을 바탕으로 자동 요약합니다.
          </p>
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
            snippet={form.bodyText}
            inputId="kw-input-paste"
          />
        </CardContent>
      </Card>

      {/* ───────── 제출 ───────── */}
      <div className="flex justify-end pt-1">
        <Button type="submit" disabled={isSubmitting} className="min-w-[120px]">
          {isSubmitting ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              등록 중...
            </>
          ) : (
            <>
              <Send className="mr-2 h-4 w-4" />
              등록
            </>
          )}
        </Button>
      </div>
    </form>
  )
}
