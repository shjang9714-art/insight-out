'use client'

import { useEffect, useState } from 'react'
import { Loader2, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import AdminEmptyState from '@/components/admin/ui/AdminEmptyState'
import StatusBadge from '@/components/admin/ui/StatusBadge'
import { cn } from '@/lib/utils'
import {
  type ExclusionRuleRow,
  type ExclusionRuleType,
  type ExclusionAction,
  EXCLUSION_RULE_TYPES,
  EXCLUSION_ACTIONS,
  EXCLUSION_RULE_TYPE_LABEL,
  EXCLUSION_ACTION_LABEL,
  EXCLUSION_ACTION_TONE,
} from '@/lib/admin/exclusion-rules'

function formatKst(iso: string): string {
  return new Date(iso).toLocaleString('ko-KR', {
    timeZone: 'Asia/Seoul',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  })
}

/** 최근 차단(last_hit_at) 상대 표기 — 194. null 이면 호출부에서 '—' 처리. */
function formatRelativeHit(iso: string): string {
  const diffDays = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)
  if (diffDays <= 0) return '오늘'
  const base = `${diffDays}일 전`
  return diffDays >= 30 ? `${base} · 오래됨` : base
}

const FORM_INIT = {
  rule_type: 'domain' as ExclusionRuleType,
  value: '',
  action: 'reject' as ExclusionAction,
  note: '',
  created_by: '',
}

export default function ExclusionRulesManager() {
  const [rules, setRules] = useState<ExclusionRuleRow[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [tableReady, setTableReady] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState(FORM_INIT)
  const [formError, setFormError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  const [workingId, setWorkingId] = useState<string | null>(null)

  async function loadRules() {
    setIsLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/exclusion-rules')
      const data = await res.json() as { items: ExclusionRuleRow[]; tableReady: boolean }
      setRules(data.items ?? [])
      setTableReady(data.tableReady ?? true)
    } catch {
      setError('목록을 불러오지 못했습니다.')
      setTableReady(false)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    const run = async () => { await loadRules() }
    void run()
  }, [])

  function openCreate() {
    setForm(FORM_INIT)
    setFormError(null)
    setShowCreate(true)
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!form.value.trim()) {
      setFormError('값을 입력해주세요.')
      return
    }
    setIsSaving(true)
    setFormError(null)
    try {
      const res = await fetch('/api/admin/exclusion-rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await res.json() as { item?: ExclusionRuleRow; error?: string }
      if (!res.ok || !data.item) {
        setFormError(data.error ?? '생성에 실패했습니다.')
        return
      }
      setShowCreate(false)
      await loadRules()
    } catch {
      setFormError('생성 중 오류가 발생했습니다.')
    } finally {
      setIsSaving(false)
    }
  }

  async function patchRule(id: string, fields: Record<string, unknown>) {
    setWorkingId(id)
    try {
      const res = await fetch('/api/admin/exclusion-rules', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, ...fields }),
      })
      const data = await res.json() as { item?: ExclusionRuleRow; error?: string }
      if (res.ok && data.item) {
        setRules((prev) => prev.map((r) => (r.id === id ? data.item! : r)))
      } else {
        setError(data.error ?? '수정에 실패했습니다.')
      }
    } catch {
      setError('수정 중 오류가 발생했습니다.')
    } finally {
      setWorkingId(null)
    }
  }

  async function handleDelete(rule: ExclusionRuleRow) {
    if (!window.confirm(`"${rule.value}" 규칙을 삭제하시겠습니까?`)) return
    setWorkingId(rule.id)
    try {
      const res = await fetch(`/api/admin/exclusion-rules?id=${rule.id}`, { method: 'DELETE' })
      if (res.ok) {
        setRules((prev) => prev.filter((r) => r.id !== rule.id))
      } else {
        const data = await res.json() as { error?: string }
        setError(data.error ?? '삭제에 실패했습니다.')
      }
    } catch {
      setError('삭제 중 오류가 발생했습니다.')
    } finally {
      setWorkingId(null)
    }
  }

  const totalHits = rules.reduce((sum, r) => sum + (r.hit_count ?? 0), 0)
  const neverHitCount = rules.filter((r) => r.is_active && (r.hit_count ?? 0) === 0).length
  const summaryLine = rules.length === 0
    ? '총 0개 규칙'
    : totalHits === 0
      ? `규칙 ${rules.length}개 · 아직 집계 전(수집 1회 후 반영)`
      : `규칙 ${rules.length}개 · 지금까지 ${totalHits.toLocaleString()}건 차단${neverHitCount > 0 ? ` · 안 걸린 규칙 ${neverHitCount}개` : ''}`

  return (
    <div className="space-y-6">
      {!tableReady && (
        <AdminEmptyState
          message="exclusion_rules 테이블이 아직 적용되지 않았습니다."
          hint="SQL 핸드오프 적용 후 자동으로 활성화됩니다. 그동안 크롤러는 기존 방식대로 동작합니다."
        />
      )}

      <div className="flex items-center justify-between gap-3">
        <p className="admin-body text-muted-foreground">
          {isLoading ? '불러오는 중…' : summaryLine}
        </p>
        <Button size="sm" onClick={openCreate} disabled={!tableReady}>
          <Plus className="mr-1.5 h-4 w-4" />
          규칙 추가
        </Button>
      </div>

      {error && <p className="admin-caption text-negative">{error}</p>}

      {isLoading ? (
        <div className="flex items-center justify-center py-16 admin-body text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          불러오는 중...
        </div>
      ) : rules.length === 0 ? (
        <AdminEmptyState message={tableReady ? '등록된 제외 규칙이 없습니다.' : '규칙을 표시할 수 없습니다.'} />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <table className="w-full min-w-[720px] admin-body">
            <thead>
              <tr className="border-b border-border bg-muted text-left admin-table-th text-muted-foreground">
                <th className="px-4 py-3">종류</th>
                <th className="px-4 py-3">값</th>
                <th className="px-4 py-3">동작</th>
                <th className="px-4 py-3">활성</th>
                <th className="px-4 py-3">적중</th>
                <th className="px-4 py-3 whitespace-nowrap">최근 차단</th>
                <th className="px-4 py-3">비고</th>
                <th className="px-4 py-3 whitespace-nowrap">등록일 (KST)</th>
                <th className="px-4 py-3 text-right">관리</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rules.map((r) => (
                <tr key={r.id} className={cn('hover:bg-accent/50 transition-colors', !r.is_active && 'opacity-50')}>
                  <td className="whitespace-nowrap px-4 py-3 admin-table-td text-muted-foreground">
                    {EXCLUSION_RULE_TYPE_LABEL[r.rule_type] ?? r.rule_type}
                  </td>
                  <td className="max-w-xs px-4 py-3 admin-table-td font-medium text-foreground">
                    <span className="block truncate" title={r.value}>{r.value}</span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <StatusBadge
                      tone={EXCLUSION_ACTION_TONE[r.action] ?? 'neutral'}
                      label={EXCLUSION_ACTION_LABEL[r.action] ?? r.action}
                    />
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <button
                      onClick={() => void patchRule(r.id, { is_active: !r.is_active })}
                      disabled={workingId === r.id}
                      className={cn(
                        'admin-table-td font-medium transition-colors',
                        r.is_active ? 'text-positive hover:opacity-80' : 'text-muted-foreground hover:text-foreground'
                      )}
                    >
                      {r.is_active ? '활성' : '비활성'}
                    </button>
                  </td>
                  <td className={cn(
                    'whitespace-nowrap px-4 py-3 admin-table-td',
                    r.hit_count > 0 ? 'font-medium text-foreground' : 'text-muted-foreground'
                  )}>
                    {r.hit_count.toLocaleString()}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 admin-caption text-muted-foreground">
                    {r.last_hit_at ? formatRelativeHit(r.last_hit_at) : '—'}
                  </td>
                  <td className="max-w-[200px] px-4 py-3 admin-caption text-muted-foreground">
                    {r.note ? <span className="block truncate" title={r.note}>{r.note}</span> : '—'}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 admin-caption text-muted-foreground">
                    {formatKst(r.created_at)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => void handleDelete(r)}
                      disabled={workingId === r.id}
                      className="rounded p-1.5 text-muted-foreground/40 transition-colors hover:bg-negative-soft hover:text-negative"
                      title="삭제"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>제외 규칙 추가</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="rule-type">종류</Label>
                <Select value={form.rule_type} onValueChange={(v) => setForm((f) => ({ ...f, rule_type: v as ExclusionRuleType }))}>
                  <SelectTrigger id="rule-type"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {EXCLUSION_RULE_TYPES.map((t) => (
                      <SelectItem key={t} value={t}>{EXCLUSION_RULE_TYPE_LABEL[t]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="rule-action">동작</Label>
                <Select value={form.action} onValueChange={(v) => setForm((f) => ({ ...f, action: v as ExclusionAction }))}>
                  <SelectTrigger id="rule-action"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {EXCLUSION_ACTIONS.map((a) => (
                      <SelectItem key={a} value={a}>{EXCLUSION_ACTION_LABEL[a]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="rule-value">값</Label>
              <Input
                id="rule-value"
                value={form.value}
                onChange={(e) => setForm((f) => ({ ...f, value: e.target.value }))}
                placeholder={
                  form.rule_type === 'domain' ? '예: example.com'
                    : form.rule_type === 'url_pattern' ? '예: /promo/'
                    : '예: 쿠폰'
                }
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="rule-note">비고</Label>
              <Input
                id="rule-note"
                value={form.note}
                onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
                placeholder="선택"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="rule-created-by">작성자</Label>
              <Input
                id="rule-created-by"
                value={form.created_by}
                onChange={(e) => setForm((f) => ({ ...f, created_by: e.target.value }))}
                placeholder="예: David / Opus / Sonnet"
              />
            </div>

            {formError && <p className="admin-caption text-negative">{formError}</p>}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowCreate(false)} disabled={isSaving}>
                취소
              </Button>
              <Button type="submit" disabled={isSaving}>
                {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : '생성'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
