'use client'

// 349 — 보고서 본문 편집기(어드민).
// 형광펜(mark)·굵게(strong) 구간을 코드 배포 없이 어드민에서 조정한다.
// 저장은 PATCH /api/admin/reports/import → sanitizeReportHtml 로 살균 후 body_html 갱신.

import { useRef, useState } from 'react'
import { Highlighter, Bold, Eraser, Loader2, Save } from 'lucide-react'
import { Button } from '@/components/ui/button'
import AdminErrorBox from '@/components/admin/ui/AdminErrorBox'

interface Props {
  reportId: string
  initialBodyHtml: string
}

/** 선택 영역을 태그로 감싼다. 이미 같은 태그로 감싸져 있으면 벗긴다(토글). */
function wrapSelection(value: string, start: number, end: number, tag: 'mark' | 'strong'): string {
  if (start === end) return value
  const selected = value.slice(start, end)
  const open = `<${tag}>`
  const close = `</${tag}>`

  // 토글: 선택 영역이 정확히 태그로 감싸져 있으면 제거
  if (selected.startsWith(open) && selected.endsWith(close)) {
    const inner = selected.slice(open.length, selected.length - close.length)
    return value.slice(0, start) + inner + value.slice(end)
  }
  // 바로 바깥이 태그면 제거
  const before = value.slice(Math.max(0, start - open.length), start)
  const after = value.slice(end, end + close.length)
  if (before === open && after === close) {
    return value.slice(0, start - open.length) + selected + value.slice(end + close.length)
  }
  return value.slice(0, start) + open + selected + close + value.slice(end)
}

/** 선택 영역에서 mark/strong 태그를 모두 벗긴다 */
function stripEmphasis(value: string, start: number, end: number): string {
  if (start === end) return value
  const cleaned = value
    .slice(start, end)
    .replace(/<\/?(?:mark|strong)>/g, '')
  return value.slice(0, start) + cleaned + value.slice(end)
}

export default function AdminReportBodyEditor({ reportId, initialBodyHtml }: Props) {
  const ref = useRef<HTMLTextAreaElement>(null)
  const [html, setHtml] = useState(initialBodyHtml)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const apply = (fn: (v: string, s: number, e: number) => string) => {
    const el = ref.current
    if (!el) return
    const next = fn(html, el.selectionStart, el.selectionEnd)
    setHtml(next)
    setSaved(false)
    // 선택 유지가 어려우므로 커서만 되돌린다
    requestAnimationFrame(() => el.focus())
  }

  const handleSave = async () => {
    setSaving(true); setError(null); setSaved(false)
    try {
      const res = await fetch('/api/admin/reports/import', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reportId, bodyHtml: html }),
      })
      const data = await res.json() as { error?: string }
      if (!res.ok) throw new Error(data.error ?? '저장 실패')
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } catch (e) {
      setError(e instanceof Error ? e.message : '본문 저장에 실패했습니다.')
    } finally {
      setSaving(false)
    }
  }

  const markCount = (html.match(/<mark>/g) ?? []).length
  const strongCount = (html.match(/<strong>/g) ?? []).length

  return (
    <div className="space-y-3 rounded-xl border border-border bg-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-foreground">본문 편집 — 강조 구간 조정</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            텍스트를 선택하고 버튼을 누르면 해당 구간에 태그가 씌워집니다(다시 누르면 해제).
            형광펜 {markCount}개 · 굵게 {strongCount}개 · <strong>권장: 형광펜은 섹션당 2~3회</strong>
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5">
        <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={() => apply((v, s, e) => wrapSelection(v, s, e, 'mark'))}>
          <Highlighter className="h-3.5 w-3.5" />
          형광펜
        </Button>
        <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={() => apply((v, s, e) => wrapSelection(v, s, e, 'strong'))}>
          <Bold className="h-3.5 w-3.5" />
          굵게
        </Button>
        <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={() => apply(stripEmphasis)}>
          <Eraser className="h-3.5 w-3.5" />
          강조 해제
        </Button>
      </div>

      <textarea
        ref={ref}
        value={html}
        onChange={(e) => { setHtml(e.target.value); setSaved(false) }}
        rows={20}
        spellCheck={false}
        className="w-full rounded-lg border border-border bg-background p-3 font-mono text-xs leading-relaxed"
      />

      <div className="flex items-center gap-2">
        <Button type="button" size="sm" onClick={handleSave} disabled={saving} className="gap-1.5">
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
          {saved ? '저장되었습니다' : '본문 저장'}
        </Button>
        <span className="text-xs text-muted-foreground">
          저장 시 허용 태그 외(script·style·on* 등)는 자동 제거됩니다.
        </span>
      </div>

      {error && <AdminErrorBox>{error}</AdminErrorBox>}
    </div>
  )
}
