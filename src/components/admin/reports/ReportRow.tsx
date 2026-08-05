'use client'
import { useAdminConfirm } from '@/components/admin/ui/AdminConfirm'

import { useState } from 'react'
import AdminReportBodyEditor from '@/components/admin/reports/AdminReportBodyEditor'
import { Loader2, ChevronDown, ChevronUp, Upload, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import StatusBadge from '@/components/admin/ui/StatusBadge'
import AdminErrorBox from '@/components/admin/ui/AdminErrorBox'
import ReportSourcePicker from '@/components/admin/reports/ReportSourcePicker'
import { createClient } from '@/lib/supabase/client'
import { uploadCoverFile } from '@/lib/contents/upload-cover'
import { compressImageToLimit } from '@/lib/images/compress-image'
import { resolveStorageUrl } from '@/lib/storage/resolve-url'
import { cn } from '@/lib/utils'
import type { AiReportType, AiReportStatus } from '@/lib/types'

export interface AdminReportListItem {
  id: string
  title: string
  type: AiReportType
  status: AiReportStatus
  topic: string | null
  summary: string | null
  cover_image_url: string | null
  publisher: string | null
  published_at: string | null
  error_message: string | null
  created_at: string
  updated_at: string
}

interface ReportDetailResponse {
  report: AdminReportListItem & { prompt: string | null; body_md: string | null; body_html: string | null }
  bodyHtmlSanitized: string | null
  sourceIssueIds: string[]
  contentIds: string[]
}

const REPORT_TYPES: AiReportType[] = ['시장동향', '경쟁사분석', '키워드분석', '서비스리포트', '자유주제']

const STATUS_TONE: Record<AiReportStatus, 'neutral' | 'risk' | 'positive' | 'negative'> = {
  draft: 'neutral',
  generating: 'risk',
  completed: 'positive',
  failed: 'negative',
}

const STATUS_LABEL: Record<AiReportStatus, string> = {
  draft: '초안',
  generating: '생성 중',
  completed: '완료',
  failed: '실패',
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`
}

function toDatetimeLocal(iso: string | null): string {
  const d = iso ? new Date(iso) : new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

interface ReportRowProps {
  report: AdminReportListItem
  onChanged: () => void
  onDeleted: () => void
}

export default function ReportRow({ report, onChanged, onDeleted }: ReportRowProps) {
  const confirm = useAdminConfirm()
  const [expanded, setExpanded] = useState(false)
  const [detail, setDetail] = useState<ReportDetailResponse | null>(null)
  const [isLoadingDetail, setIsLoadingDetail] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // 재생성 폼
  const [type, setType] = useState<AiReportType>(report.type)
  const [topic, setTopic] = useState(report.topic ?? '')
  const [title, setTitle] = useState(report.title)
  const [promptOverride, setPromptOverride] = useState('')
  const [selectedIssueIds, setSelectedIssueIds] = useState<Set<string>>(new Set())
  const [selectedContentIds, setSelectedContentIds] = useState<Set<string>>(new Set())
  const [isGenerating, setIsGenerating] = useState(false)

  // 표지
  const [coverPreview, setCoverPreview] = useState<string | null>(report.cover_image_url)
  const [isUploadingCover, setIsUploadingCover] = useState(false)

  // 발행
  const [publisher, setPublisher] = useState(report.publisher ?? '인사이트 아웃')
  const [publishedAt, setPublishedAt] = useState(toDatetimeLocal(report.published_at))
  const [isPublishing, setIsPublishing] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  const isPublished = Boolean(report.published_at)
  const resolvedCoverPreview = resolveStorageUrl(coverPreview)

  const loadDetail = async () => {
    setIsLoadingDetail(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/reports/${report.id}`, { cache: 'no-store' })
      const json = (await res.json()) as ReportDetailResponse & { error?: string }
      if (!res.ok) throw new Error(json.error ?? '상세를 불러오지 못했습니다.')
      setDetail(json)
      setSelectedIssueIds(new Set(json.sourceIssueIds))
      setSelectedContentIds(new Set(json.contentIds))
    } catch (err) {
      setError(err instanceof Error ? err.message : '상세를 불러오지 못했습니다.')
    } finally {
      setIsLoadingDetail(false)
    }
  }

  const toggleExpand = () => {
    const next = !expanded
    setExpanded(next)
    if (next && !detail) void loadDetail()
  }

  const handleGenerate = async () => {
    if (!topic.trim()) {
      setError('주제를 입력해주세요.')
      return
    }
    setIsGenerating(true)
    setError(null)
    try {
      const res = await fetch('/api/reports/generate-strategy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reportId: report.id,
          type,
          topic: topic.trim(),
          title: title.trim() || undefined,
          sourceIssueIds: Array.from(selectedIssueIds),
          contentIds: Array.from(selectedContentIds),
          promptOverride: promptOverride.trim() || undefined,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? '재생성에 실패했습니다.')
      if (json.status === 'failed') {
        setError(json.error ?? '생성에 실패했습니다.')
      }
      await loadDetail()
      onChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : '재생성 중 오류가 발생했습니다.')
    } finally {
      setIsGenerating(false)
    }
  }

  const handleCoverUpload = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      setError('이미지 파일만 업로드할 수 있습니다.')
      return
    }
    setIsUploadingCover(true)
    setError(null)
    try {
      // 368 — 용량이 크면 먼저 자동으로 줄여본다. 그래도 2MB를 넘으면 그때 반려.
      const compressed = await compressImageToLimit(file)
      if (compressed.size > 2 * 1024 * 1024) {
        setError('이미지 용량은 2MB 이하여야 합니다.')
        return
      }
      const supabase = createClient()
      const ext = compressed.name.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg'
      // ⚠️ uploadCoverFile()만 사용 — uploadCover()는 contents.thumbnail_url을 갱신하므로 절대 쓰지 않는다.
      const storagePath = await uploadCoverFile(supabase, report.id, compressed, ext)
      const res = await fetch(`/api/admin/reports/${report.id}/cover`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cover_image_url: storagePath }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? '표지 저장에 실패했습니다.')
      setCoverPreview(storagePath)
      onChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : '표지 업로드 중 오류가 발생했습니다.')
    } finally {
      setIsUploadingCover(false)
    }
  }

  const handlePublish = async (action: 'publish' | 'unpublish') => {
    setIsPublishing(true)
    setError(null)
    try {
      const res = await fetch(`/api/reports/${report.id}/publish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          action === 'unpublish'
            ? { action: 'unpublish' }
            : { action: 'publish', publisher: publisher.trim() || '인사이트 아웃', published_at: new Date(publishedAt).toISOString() }
        ),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? '발행 처리에 실패했습니다.')
      onChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : '발행 처리 중 오류가 발생했습니다.')
    } finally {
      setIsPublishing(false)
    }
  }

  const handleDelete = async () => {
    if (!(await confirm({ title: '보고서 삭제', description: '되돌릴 수 없습니다.', targets: [report.title], confirmLabel: '삭제', destructive: true }))) return
    setIsDeleting(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/reports/${report.id}`, { method: 'DELETE' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? '삭제에 실패했습니다.')
      onDeleted()
    } catch (err) {
      setError(err instanceof Error ? err.message : '삭제 중 오류가 발생했습니다.')
      setIsDeleting(false)
    }
  }

  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="flex items-center gap-3 p-4">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-foreground">{report.title}</p>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <span className="rounded-full border border-border px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
              {report.type}
            </span>
            <StatusBadge tone={STATUS_TONE[report.status]} label={STATUS_LABEL[report.status]} />
            {isPublished ? (
              <StatusBadge tone="positive" label={`발행됨 · ${formatDate(report.published_at!)}`} />
            ) : (
              <StatusBadge tone="neutral" label="미발행" />
            )}
          </div>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={toggleExpand}>
          관리 {expanded ? <ChevronUp className="ml-1 h-3.5 w-3.5" /> : <ChevronDown className="ml-1 h-3.5 w-3.5" />}
        </Button>
      </div>

      {expanded && (
        <div className="space-y-6 border-t border-border p-4">
          {error && <AdminErrorBox onDismiss={() => setError(null)}>{error}</AdminErrorBox>}

          {isLoadingDetail ? (
            <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> 불러오는 중…
            </div>
          ) : (
            <>
              {/* 미리보기 */}
              <div>
                <p className="mb-2 text-xs font-semibold text-foreground">미리보기</p>
                {detail?.bodyHtmlSanitized ? (
                  <div
                    className={cn(
                      // 349: io-report-body → 서비스와 동일한 형광펜(mark)·불릿 렌더로 미리보기
                      'io-report-body max-h-72 overflow-y-auto rounded-lg border border-border bg-background p-4',
                      '[&_h2]:text-sm [&_h2]:font-semibold [&_h2]:mb-2 [&_h2]:mt-4',
                      '[&_h3]:text-xs [&_h3]:font-semibold [&_h3]:mb-1.5 [&_h3]:mt-3',
                      '[&_p]:text-xs [&_p]:text-foreground/90 [&_p]:leading-relaxed [&_p]:mb-2',
                      '[&_ul]:mb-2 [&_ul]:space-y-1',
                      '[&_ol]:mb-2 [&_ol]:space-y-1',
                      '[&_li]:text-xs',
                      '[&_table]:w-full [&_table]:text-xs [&_table]:mb-2',
                      '[&_th]:border [&_th]:border-border [&_th]:bg-muted [&_th]:px-2 [&_th]:py-1',
                      '[&_td]:border [&_td]:border-border [&_td]:px-2 [&_td]:py-1',
                    )}
                    dangerouslySetInnerHTML={{ __html: detail.bodyHtmlSanitized }}
                  />
                ) : detail?.report.body_md ? (
                  <div className="max-h-72 overflow-y-auto whitespace-pre-wrap rounded-lg border border-border bg-background p-4 text-xs text-foreground/90">
                    {detail.report.body_md}
                  </div>
                ) : (
                  <p className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">
                    본문이 없습니다.
                  </p>
                )}
                {report.error_message && (
                  <p className="mt-2 text-xs text-negative">사유: {report.error_message}</p>
                )}
              </div>

              {/* 349: 본문 편집 — 형광펜·굵게 구간을 코드 배포 없이 조정 */}
              {detail?.report.body_html && (
                <AdminReportBodyEditor
                  key={detail.report.id}
                  reportId={detail.report.id}
                  initialBodyHtml={detail.report.body_html}
                />
              )}

              {/* 생성/재생성 */}
              <div>
                <p className="mb-2 text-xs font-semibold text-foreground">생성 · 재생성</p>
                <div className="space-y-3 rounded-lg border border-border p-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="mb-1 block text-[11px] text-muted-foreground">유형</label>
                      <Select value={type} onValueChange={(v) => setType(v as AiReportType)}>
                        <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {REPORT_TYPES.map((t) => (
                            <SelectItem key={t} value={t}>{t}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <label className="mb-1 block text-[11px] text-muted-foreground">제목(선택)</label>
                      <input
                        type="text"
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        className="h-8 w-full rounded-lg border border-border bg-background px-2.5 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-brand-600/30"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="mb-1 block text-[11px] text-muted-foreground">주제(필수)</label>
                    <input
                      type="text"
                      value={topic}
                      onChange={(e) => setTopic(e.target.value)}
                      placeholder="예: 2026년 하반기 AICC 시장 동향"
                      className="h-8 w-full rounded-lg border border-border bg-background px-2.5 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-brand-600/30"
                    />
                  </div>

                  <ReportSourcePicker
                    selectedIssueIds={selectedIssueIds}
                    onChangeIssueIds={setSelectedIssueIds}
                    selectedContentIds={selectedContentIds}
                    onChangeContentIds={setSelectedContentIds}
                  />

                  <div>
                    <label className="mb-1 block text-[11px] text-muted-foreground">프롬프트 오버라이드(선택)</label>
                    <textarea
                      value={promptOverride}
                      onChange={(e) => setPromptOverride(e.target.value)}
                      rows={3}
                      placeholder="비워두면 어드민 프롬프트(strategy_report)를 사용합니다."
                      className="w-full rounded-lg border border-border bg-background p-2.5 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-brand-600/30"
                    />
                  </div>

                  <Button type="button" size="sm" variant="brand" onClick={handleGenerate} disabled={isGenerating}>
                    {isGenerating && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                    {report.status === 'draft' ? '생성' : '재생성'}
                  </Button>
                </div>
              </div>

              {/* 표지 */}
              <div>
                <p className="mb-2 text-xs font-semibold text-foreground">표지</p>
                <div className="flex items-start gap-4 rounded-lg border border-border p-3">
                  <div className="aspect-[16/9] w-40 shrink-0 overflow-hidden rounded-lg bg-muted">
                    {resolvedCoverPreview ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={resolvedCoverPreview} alt="표지 미리보기" className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-[11px] text-muted-foreground">
                        표지 없음
                      </div>
                    )}
                  </div>
                  <div className="space-y-2">
                    <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-accent/40">
                      {isUploadingCover ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                      업로드
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        disabled={isUploadingCover}
                        onChange={(e) => {
                          const f = e.target.files?.[0]
                          if (f) void handleCoverUpload(f)
                        }}
                      />
                    </label>
                    <Button type="button" variant="ghost" size="sm" disabled className="cursor-not-allowed opacity-60" title="준비 중">
                      AI 생성(준비 중)
                    </Button>
                    <p className="text-[11px] text-muted-foreground">권장 1200×675(16:9). 용량이 크면 자동으로 줄입니다.</p>
                  </div>
                </div>
              </div>

              {/* 발행 */}
              <div>
                <p className="mb-2 text-xs font-semibold text-foreground">발행</p>
                <div className="space-y-3 rounded-lg border border-border p-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="mb-1 block text-[11px] text-muted-foreground">발행자</label>
                      <input
                        type="text"
                        value={publisher}
                        onChange={(e) => setPublisher(e.target.value)}
                        className="h-8 w-full rounded-lg border border-border bg-background px-2.5 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-brand-600/30"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-[11px] text-muted-foreground">발행일시</label>
                      <input
                        type="datetime-local"
                        value={publishedAt}
                        onChange={(e) => setPublishedAt(e.target.value)}
                        className="h-8 w-full rounded-lg border border-border bg-background px-2.5 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-brand-600/30"
                      />
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" size="sm" variant="brand" onClick={() => handlePublish('publish')} disabled={isPublishing}>
                      {isPublishing && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                      {isPublished ? '재발행(정보 갱신)' : '발행'}
                    </Button>
                    {isPublished && (
                      <Button type="button" size="sm" variant="outline" onClick={() => handlePublish('unpublish')} disabled={isPublishing}>
                        발행 해제
                      </Button>
                    )}
                  </div>
                </div>
              </div>

              {/* 삭제 */}
              <div className="flex justify-end border-t border-border pt-4">
                <Button type="button" variant="destructive" size="sm" onClick={handleDelete} disabled={isDeleting}>
                  {isDeleting ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Trash2 className="mr-1.5 h-3.5 w-3.5" />}
                  삭제
                </Button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
