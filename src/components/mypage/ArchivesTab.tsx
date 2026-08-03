'use client'

import { ChevronDown, ChevronRight, Mail, Trash2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { ArchiveWithItems } from './types'

interface Props {
  archives: ArchiveWithItems[]
  loading: boolean
  error: string | null
  expandedArchiveId: string | null
  setExpandedArchiveId: (id: string | null) => void
  sendingArchiveId: string | null
  sendResult: { archiveId: string; to: string } | null
  emailInputArchiveId: string | null
  setEmailInputArchiveId: (id: string | null) => void
  emailInputValue: string
  setEmailInputValue: (value: string) => void
  defaultEmail: string
  onDeleteArchive: (archiveId: string) => void
  onRemoveItem: (archiveId: string, contentId: string | null, youtubeId: string | null, reportId?: string | null) => void
  onSendEmail: (archiveId: string, recipientsInput?: string) => void
  clearSendResult: () => void
}

export default function ArchivesTab({
  archives,
  loading,
  error,
  expandedArchiveId,
  setExpandedArchiveId,
  sendingArchiveId,
  sendResult,
  emailInputArchiveId,
  setEmailInputArchiveId,
  emailInputValue,
  setEmailInputValue,
  defaultEmail,
  onDeleteArchive,
  onRemoveItem,
  onSendEmail,
  clearSendResult,
}: Props) {
  return (
    <section id="archives" className="scroll-mt-24 rounded-xl border border-border bg-card p-6 shadow-sm">
      <div className="mb-5">
        <h2 className="text-base font-semibold text-foreground">아카이브</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          담아둔 콘텐츠 모음입니다. 아카이브 단위로 이메일로 받아볼 수 있습니다.
        </p>
      </div>

      {loading ? (
        <p className="py-4 text-center text-sm text-muted-foreground">불러오는 중...</p>
      ) : archives.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          아직 담아둔 아카이브가 없습니다. 콘텐츠 상세 페이지에서 &quot;아카이빙 담기&quot;를 눌러 보세요.
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {archives.map((archive) => (
            <div key={archive.id} className="overflow-hidden rounded-xl border border-border">
              <div className="flex items-center justify-between bg-muted px-4 py-3">
                <button
                  type="button"
                  onClick={() => setExpandedArchiveId(expandedArchiveId === archive.id ? null : archive.id)}
                  className="flex items-center gap-2 text-sm font-medium text-foreground hover:text-brand-600"
                >
                  {expandedArchiveId === archive.id
                    ? <ChevronDown className="h-4 w-4" />
                    : <ChevronRight className="h-4 w-4" />}
                  {archive.name}
                  <span className="text-xs font-normal text-muted-foreground">{archive.items.length}건</span>
                </button>
                <div className="flex items-center gap-1.5">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      if (emailInputArchiveId === archive.id) {
                        setEmailInputArchiveId(null)
                      } else {
                        setEmailInputArchiveId(archive.id)
                        setEmailInputValue(defaultEmail)
                        clearSendResult()
                      }
                    }}
                    className="h-7 text-xs"
                  >
                    <Mail className="mr-1 h-3.5 w-3.5" />
                    이메일로 받기
                  </Button>
                  <button
                    type="button"
                    onClick={() => onDeleteArchive(archive.id)}
                    className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-red-50/80 hover:text-red-500"
                    title="아카이브 삭제"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {emailInputArchiveId === archive.id && (
                <div className="flex items-center gap-2 border-b border-border bg-muted/30 px-4 py-2.5">
                  <input
                    type="text"
                    value={emailInputValue}
                    onChange={(e) => setEmailInputValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        onSendEmail(archive.id, emailInputValue)
                      }
                    }}
                    placeholder="수신 이메일 (쉼표로 여러 명)"
                    className="h-8 flex-1 rounded-md border border-border bg-background px-2.5 text-xs placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-brand-600"
                  />
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => onSendEmail(archive.id, emailInputValue)}
                    disabled={sendingArchiveId === archive.id || !emailInputValue.trim()}
                    className="h-8 bg-brand-solid px-3 text-xs text-white hover:bg-brand-solid-hover"
                  >
                    {sendingArchiveId === archive.id ? '발송 중...' : '발송'}
                  </Button>
                  <button
                    type="button"
                    onClick={() => setEmailInputArchiveId(null)}
                    className="rounded p-1 text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}

              {sendResult?.archiveId === archive.id && (
                <p className="bg-positive-soft px-4 py-2 text-xs text-positive">
                  {sendResult.to} 으로 발송되었습니다.
                </p>
              )}

              {expandedArchiveId === archive.id && (
                <div className="divide-y divide-border">
                  {archive.items.length === 0 ? (
                    <p className="px-4 py-3 text-xs text-muted-foreground">담긴 콘텐츠가 없습니다.</p>
                  ) : (
                    archive.items.map((item) => (
                      <div
                        key={item.content_id ?? item.ai_report_id ?? item.youtube_video_id}
                        className="flex items-start justify-between gap-2 px-4 py-3"
                      >
                        <div className="min-w-0 flex-1">
                          {item.contents ? (
                            <a
                              href={`/dashboard/contents/${item.contents.id}`}
                              target="_blank"
                              rel="noopener"
                              className="line-clamp-1 text-sm font-medium text-foreground hover:text-brand-600"
                            >
                              {item.contents.title}
                            </a>
                          ) : item.ai_reports ? (
                            <a
                              href={`/dashboard/reports/${item.ai_reports.id}`}
                              className="line-clamp-1 text-sm font-medium text-foreground hover:text-brand-600"
                            >
                              {item.ai_reports.title}
                            </a>
                          ) : (
                            <span className="text-sm text-muted-foreground">(삭제된 항목)</span>
                          )}
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            {item.contents?.category ?? (item.ai_reports ? `AI 리포트 · ${item.ai_reports.type}` : null)}
                            {' · '}
                            {new Date(item.added_at).toLocaleDateString('ko-KR')}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => onRemoveItem(archive.id, item.content_id, item.youtube_video_id, item.ai_report_id)}
                          className="shrink-0 rounded p-1 text-muted-foreground/40 transition-colors hover:text-red-400"
                          title="목록에서 제거"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {error && <p className="mt-3 text-xs text-negative">{error}</p>}
    </section>
  )
}
