'use client'

import { useState } from 'react'
import { AlertTriangle, Check, ChevronDown, ChevronUp, ExternalLink, Loader2, Pencil, X } from 'lucide-react'
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
import { DAILY_INSIGHT_CATEGORIES } from '@/lib/daily-insights/constants'
import { DAILY_INSIGHT_STATUS_TONE } from '@/lib/admin/status-style'
import type { DailyInsightRow } from '@/lib/daily-insights/types'
import { stripLlmArtifacts } from '@/lib/text/strip-llm-artifacts'

const STATUS_LABEL: Record<DailyInsightRow['status'], string> = {
  published: '게시됨',
  rejected: '반려됨',
}

export interface DailyInsightEditableFields {
  headline: string
  summary_ko: string
  category: string | null
  market_trend: string | null
  competitor_trend: string | null
  implication: string | null
}

function editableFieldsFromCard(card: DailyInsightRow): DailyInsightEditableFields {
  return {
    headline: card.headline,
    summary_ko: card.summary_ko,
    category: card.category,
    market_trend: card.market_trend,
    competitor_trend: card.competitor_trend,
    implication: card.implication,
  }
}

interface DailyInsightAdminCardProps {
  card: DailyInsightRow
  isBusy?: boolean
  onSaveFields: (patch: Partial<DailyInsightEditableFields>) => Promise<void>
  onToggleReviewed: (needsReview: boolean) => Promise<void>
  onStatusChange: (status: 'published' | 'rejected') => Promise<void>
  onMove?: (direction: 'up' | 'down') => void
  canMoveUp?: boolean
  canMoveDown?: boolean
}

export default function DailyInsightAdminCard({
  card,
  isBusy = false,
  onSaveFields,
  onToggleReviewed,
  onStatusChange,
  onMove,
  canMoveUp = false,
  canMoveDown = false,
}: DailyInsightAdminCardProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [fields, setFields] = useState<DailyInsightEditableFields>(editableFieldsFromCard(card))
  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

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
    if (!fields.headline.trim() || !fields.summary_ko.trim()) {
      setSaveError('헤드라인과 요약은 비울 수 없습니다.')
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

  return (
    <div className="rounded-xl border border-border bg-card p-5 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge tone={DAILY_INSIGHT_STATUS_TONE[card.status]} label={STATUS_LABEL[card.status]} />
          {card.needs_review && (
            <span className="inline-flex items-center gap-1 rounded-full bg-risk-soft px-2 py-0.5 text-[11px] font-medium text-risk">
              <AlertTriangle className="h-3 w-3" />
              검토 필요
            </span>
          )}
          {card.category && <Badge variant="secondary">{card.category}</Badge>}
          <span className="text-xs text-muted-foreground">{card.day_of}</span>
        </div>

        {!isEditing && (
          <div className="flex items-center gap-1 shrink-0">
            {onMove && (
              <>
                <Button type="button" variant="ghost" size="icon-sm" disabled={isBusy || !canMoveUp} onClick={() => onMove('up')} title="위로">
                  <ChevronUp className="h-3.5 w-3.5" />
                </Button>
                <Button type="button" variant="ghost" size="icon-sm" disabled={isBusy || !canMoveDown} onClick={() => onMove('down')} title="아래로">
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
            <Label htmlFor={`summary-${card.id}`}>요약</Label>
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
            <Label>카테고리</Label>
            <Select
              value={fields.category ?? undefined}
              onValueChange={(v) => setFields((p) => ({ ...p, category: v }))}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="카테고리 선택" />
              </SelectTrigger>
              <SelectContent>
                {DAILY_INSIGHT_CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {(
            [
              ['market_trend', '시장·산업 동향'],
              ['competitor_trend', '경쟁사 동향'],
              ['implication', '자사 관점 시사점'],
            ] as const
          ).map(([key, label]) => (
            <div key={key} className="flex flex-col gap-1.5">
              <Label htmlFor={`${key}-${card.id}`}>{label}</Label>
              <textarea
                data-slot="textarea"
                id={`${key}-${card.id}`}
                value={fields[key] ?? ''}
                onChange={(e) => setFields((p) => ({ ...p, [key]: e.target.value || null }))}
                rows={2}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none"
              />
            </div>
          ))}

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

          {(
            [
              ['market_trend', '📈 시장·산업 동향'],
              ['competitor_trend', '🏢 경쟁사 동향'],
              ['implication', '💡 자사 관점 시사점'],
            ] as const
          ).map(([key, label]) =>
            card[key] ? (
              <p key={key} className="text-sm text-foreground leading-relaxed border-l-2 border-brand-600/40 pl-3">
                <span className="font-medium">{label}</span> — {stripLlmArtifacts(card[key] ?? '')}
              </p>
            ) : null
          )}

          {card.source_articles && card.source_articles.length > 0 && (
            <div className="space-y-1.5 rounded-lg bg-muted/40 p-3">
              <p className="text-[11px] font-medium text-muted-foreground/80 uppercase tracking-wide">📰 근거 기사</p>
              {card.source_articles.map((a) => (
                <div key={a.content_id} className="text-xs">
                  {a.url ? (
                    <a href={a.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-medium text-foreground hover:text-brand-600 hover:underline">
                      {a.title}
                      <ExternalLink className="h-3 w-3 shrink-0" />
                    </a>
                  ) : (
                    <span className="font-medium text-foreground">{a.title}</span>
                  )}
                  <span className="ml-1.5 text-muted-foreground">
                    ({a.source}{a.published_at ? ` · ${a.published_at}` : ''})
                  </span>
                </div>
              ))}
            </div>
          )}

          {card.related_past && card.related_past.length > 0 && (
            <div className="space-y-1.5 rounded-lg bg-muted/40 p-3">
              <p className="text-[11px] font-medium text-muted-foreground/80 uppercase tracking-wide">🕰️ 과거 관련 기사</p>
              {card.related_past.map((p) => (
                <div key={p.content_id} className="text-xs">
                  {p.url ? (
                    <a href={p.url} target="_blank" rel="noopener noreferrer" className="font-medium text-foreground hover:text-brand-600 hover:underline">
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

      {!isEditing && (
        <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
          {card.needs_review && (
            <Button type="button" size="sm" variant="outline" disabled={isBusy} onClick={() => void onToggleReviewed(false)}>
              검토 완료로 표시
            </Button>
          )}
          {!card.needs_review && (
            <Button type="button" size="sm" variant="outline" disabled={isBusy} onClick={() => void onToggleReviewed(true)}>
              검토 필요로 되돌리기
            </Button>
          )}
          <div className="ml-auto flex items-center gap-2">
            {card.status === 'published' && (
              <Button type="button" variant="outline" size="sm" disabled={isBusy} onClick={() => void onStatusChange('rejected')}>
                반려
              </Button>
            )}
            {card.status === 'rejected' && (
              <Button type="button" size="sm" disabled={isBusy} onClick={() => void onStatusChange('published')}>
                게시로 되돌리기
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
