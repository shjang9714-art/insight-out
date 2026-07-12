'use client'

import { useState } from 'react'
import { AlertTriangle, Check, ChevronDown, ChevronUp, ExternalLink, Loader2, Pencil, Sparkles, Star, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import StatusBadge from '@/components/admin/ui/StatusBadge'
import { KEY_INSIGHT_CATEGORIES } from '@/lib/key-insights/constants'
import { KEY_INSIGHT_STATUS_TONE } from '@/lib/admin/status-style'
import type { KeyInsightRow, KeyInsightStatus } from '@/lib/key-insights/types'
import { stripLlmArtifacts } from '@/lib/text/strip-llm-artifacts'

const STATUS_LABEL: Record<KeyInsightStatus, string> = {
  draft: '초안',
  needs_review: '검수 대기',
  published: '게시됨',
  rejected: '반려됨',
}

export interface KeyInsightEditableFields {
  headline: string
  summary_ko: string
  implication: string | null
  category: string | null
  source_name: string | null
  published_at: string | null
  source_url: string | null
}

// 저장된 시사점 앞머리의 "LG유플러스는/LGU+는/LG유플러스 관점에서" 류 도입 문구를 렌더 시 제거.
// 이미 게시된 카드는 텍스트에 그대로 남아있으므로(과거 배치 재생성 없이) 표시 단계에서 스트립.
const IMPLICATION_LEAD_RE = /^\s*(?:LG\s?U\+|LG\s?유플러스)\s*(?:는|의|관점에서는?)?[,:]?\s*/i

function stripImplicationLead(text: string): string {
  const stripped = text.replace(IMPLICATION_LEAD_RE, '')
  return stripped.trim() ? stripped : text
}

function editableFieldsFromCard(card: KeyInsightRow): KeyInsightEditableFields {
  return {
    headline: card.headline,
    summary_ko: card.summary_ko,
    implication: card.implication,
    category: card.category,
    source_name: card.source_name,
    published_at: card.published_at,
    source_url: card.source_url,
  }
}

interface KeyInsightCardProps {
  card: KeyInsightRow
  /** review = 검수 어드민(편집 컨트롤 포함), public = 읽기 전용(공개 탭·홈에서 재사용 예정) */
  mode: 'review' | 'public'
  isBusy?: boolean
  onSaveFields?: (patch: Partial<KeyInsightEditableFields>) => Promise<void>
  onToggle?: (field: 'is_new' | 'is_featured' | 'needs_verify', value: boolean) => Promise<void>
  onStatusChange?: (status: 'published' | 'rejected' | 'needs_review') => Promise<void>
  onMove?: (direction: 'up' | 'down') => void
  canMoveUp?: boolean
  canMoveDown?: boolean
}

export default function KeyInsightCard({
  card,
  mode,
  isBusy = false,
  onSaveFields,
  onToggle,
  onStatusChange,
  onMove,
  canMoveUp = false,
  canMoveDown = false,
}: KeyInsightCardProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [fields, setFields] = useState<KeyInsightEditableFields>(editableFieldsFromCard(card))
  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [publishError, setPublishError] = useState<string | null>(null)

  const isReview = mode === 'review'

  function startEdit() {
    setFields(editableFieldsFromCard(card))
    setSaveError(null)
    setIsEditing(true)
  }

  function cancelEdit() {
    setIsEditing(false)
    setSaveError(null)
  }

  async function handleSave() {
    if (!onSaveFields) return
    if (!fields.headline.trim() || !fields.summary_ko.trim()) {
      setSaveError('헤드라인과 핵심요약은 비울 수 없습니다.')
      return
    }
    setIsSaving(true)
    setSaveError(null)
    try {
      await onSaveFields(fields)
      setIsEditing(false)
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : '저장에 실패했습니다.')
    } finally {
      setIsSaving(false)
    }
  }

  async function handlePublish() {
    if (!onStatusChange) return
    setPublishError(null)
    try {
      await onStatusChange('published')
    } catch (err) {
      setPublishError(err instanceof Error ? err.message : '게시에 실패했습니다.')
    }
  }

  return (
    <div className="rounded-xl border border-border bg-card p-5 space-y-4">
      {/* 헤더 — 상태·카테고리·NEW·발행일 */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {isReview && (
            <StatusBadge tone={KEY_INSIGHT_STATUS_TONE[card.status]} label={STATUS_LABEL[card.status]} />
          )}
          {card.category && <Badge variant="secondary">{card.category}</Badge>}
          {card.is_new && (
            <Badge className="bg-brand-600 text-white [a]:hover:bg-brand-700">
              <Sparkles className="h-3 w-3" />
              NEW
            </Badge>
          )}
          {card.is_featured && (
            <Badge variant="outline" className="gap-1">
              <Star className="h-3 w-3 fill-current" />
              PICK
            </Badge>
          )}
          {card.source_name && (
            <span className="text-xs text-muted-foreground">
              {card.source_name}
              {card.published_at ? ` · ${card.published_at}` : ''}
            </span>
          )}
        </div>

        {isReview && !isEditing && (
          <div className="flex items-center gap-1 shrink-0">
            {onMove && (
              <>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  disabled={isBusy || !canMoveUp}
                  onClick={() => onMove('up')}
                  title="위로"
                >
                  <ChevronUp className="h-3.5 w-3.5" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  disabled={isBusy || !canMoveDown}
                  onClick={() => onMove('down')}
                  title="아래로"
                >
                  <ChevronDown className="h-3.5 w-3.5" />
                </Button>
              </>
            )}
            <Button type="button" variant="outline" size="sm" disabled={isBusy} onClick={startEdit}>
              <Pencil className="h-3.5 w-3.5" />
              편집
            </Button>
          </div>
        )}
      </div>

      {/* 본문 — 편집 모드 vs 표시 모드 */}
      {isEditing ? (
        <div className="space-y-3 rounded-lg border border-border bg-muted/30 p-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`headline-${card.id}`}>헤드라인</Label>
            <Input
              id={`headline-${card.id}`}
              value={fields.headline}
              onChange={(e) => setFields((p) => ({ ...p, headline: e.target.value }))}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`summary-${card.id}`}>핵심요약 (2문장)</Label>
            <textarea
              data-slot="textarea"
              id={`summary-${card.id}`}
              value={fields.summary_ko}
              onChange={(e) => setFields((p) => ({ ...p, summary_ko: e.target.value }))}
              rows={2}
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`implication-${card.id}`}>LGU+ 관점 시사점</Label>
            <textarea
              data-slot="textarea"
              id={`implication-${card.id}`}
              value={fields.implication ?? ''}
              onChange={(e) => setFields((p) => ({ ...p, implication: e.target.value }))}
              rows={2}
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none"
            />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label>카테고리</Label>
              <Select
                value={fields.category ?? undefined}
                onValueChange={(v) => setFields((p) => ({ ...p, category: v }))}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="카테고리 선택" />
                </SelectTrigger>
                <SelectContent>
                  {KEY_INSIGHT_CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`source-name-${card.id}`}>매체명</Label>
              <Input
                id={`source-name-${card.id}`}
                value={fields.source_name ?? ''}
                onChange={(e) => setFields((p) => ({ ...p, source_name: e.target.value }))}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`published-at-${card.id}`}>발행일</Label>
              <Input
                id={`published-at-${card.id}`}
                type="date"
                value={fields.published_at ?? ''}
                onChange={(e) => setFields((p) => ({ ...p, published_at: e.target.value }))}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`source-url-${card.id}`}>원문 링크</Label>
              <Input
                id={`source-url-${card.id}`}
                value={fields.source_url ?? ''}
                onChange={(e) => setFields((p) => ({ ...p, source_url: e.target.value }))}
              />
            </div>
          </div>

          {saveError && (
            <p className="flex items-center gap-1.5 text-xs text-destructive">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              {saveError}
            </p>
          )}

          <div className="flex items-center gap-2">
            <Button type="button" size="sm" disabled={isSaving} onClick={() => void handleSave()}>
              {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
              저장
            </Button>
            <Button type="button" variant="outline" size="sm" disabled={isSaving} onClick={cancelEdit}>
              <X className="h-3.5 w-3.5" />
              취소
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div>
            <p className="font-semibold text-foreground leading-snug">{stripLlmArtifacts(card.headline)}</p>
            <p className="mt-1.5 text-sm text-muted-foreground leading-relaxed">{stripLlmArtifacts(card.summary_ko)}</p>
          </div>

          {card.implication && (
            <p className="text-sm text-foreground leading-relaxed border-l-2 border-brand-600/40 pl-3">
              💡 {stripImplicationLead(stripLlmArtifacts(card.implication))}
            </p>
          )}

          {card.source_url && (
            <a
              href={card.source_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-brand-600 hover:underline"
            >
              <ExternalLink className="h-3 w-3" />
              원문 링크 열기
            </a>
          )}

          {card.related_past && card.related_past.length > 0 && (
            <div className="space-y-1.5 rounded-lg bg-muted/40 p-3">
              <p className="text-[11px] font-medium text-muted-foreground/80 uppercase tracking-wide">
                📰 과거 관련 기사
              </p>
              {card.related_past.map((p, i) => (
                <div key={i} className="text-xs">
                  {p.url ? (
                    <a
                      href={p.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-medium text-foreground hover:text-brand-600 hover:underline"
                    >
                      {p.title}
                    </a>
                  ) : (
                    <span className="font-medium text-foreground">{p.title}</span>
                  )}
                  <span className="ml-1.5 text-muted-foreground">
                    ({p.source}{p.published_at ? ` · ${p.published_at}` : ''})
                  </span>
                  <p className="mt-0.5 text-muted-foreground">💡 {p.reason}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 검수 액션 — NEW/PICK 토글, 게시/반려, 게시 게이트 */}
      {isReview && !isEditing && (
        <div className="space-y-2 border-t border-border pt-3">
          {card.needs_verify && (
            <div className="flex flex-wrap items-center gap-2 rounded-lg bg-risk-soft px-3 py-2 text-xs text-risk">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              <span className="flex-1 min-w-0">원문 링크가 검증되지 않았습니다. 확인 후 게시해주세요.</span>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-6 px-2 text-xs"
                disabled={isBusy}
                onClick={() => onToggle?.('needs_verify', false)}
              >
                검증 완료로 표시
              </Button>
            </div>
          )}

          {publishError && (
            <p className="flex items-center gap-1.5 text-xs text-destructive">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              {publishError}
            </p>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={card.is_new}
                disabled={isBusy}
                onChange={(e) => void onToggle?.('is_new', e.target.checked)}
                className="h-3.5 w-3.5 rounded border-input"
              />
              NEW 배지
            </label>
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={card.is_featured}
                disabled={isBusy}
                onChange={(e) => void onToggle?.('is_featured', e.target.checked)}
                className="h-3.5 w-3.5 rounded border-input"
              />
              PICK 3 지정
            </label>

            <div className="ml-auto flex items-center gap-2">
              {card.status !== 'published' && (
                <Button
                  type="button"
                  size="sm"
                  disabled={isBusy || card.needs_verify}
                  title={card.needs_verify ? '링크 검증 후 게시할 수 있습니다.' : undefined}
                  onClick={() => void handlePublish()}
                >
                  게시
                </Button>
              )}
              {card.status !== 'rejected' && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={isBusy}
                  onClick={() => void onStatusChange?.('rejected')}
                >
                  반려
                </Button>
              )}
              {card.status === 'rejected' && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={isBusy}
                  onClick={() => void onStatusChange?.('needs_review')}
                >
                  검수 대기로 되돌리기
                </Button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
