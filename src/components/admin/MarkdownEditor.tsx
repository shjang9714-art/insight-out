'use client'

import { useRef, useState } from 'react'
import type { LucideIcon } from 'lucide-react'
import { Bold, Italic, Heading2, Heading3, List, ListOrdered, Link2, Quote, Eye, Pencil } from 'lucide-react'
import ReportMarkdown from '@/components/reports/ReportMarkdown'

interface Props {
  value: string
  onChange: (v: string) => void
  placeholder?: string
}

function ToolbarButton({
  icon: Icon,
  label,
  disabled,
  onClick,
}: {
  icon: LucideIcon
  label: string
  disabled: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
    >
      <Icon className="h-3.5 w-3.5" />
    </button>
  )
}

/** 어드민 콘텐츠 추가(붙여넣기·URL 임포트) 본문 편집용 마크다운 에디터(212). 신규 dep 없음. */
export default function MarkdownEditor({ value, onChange, placeholder }: Props) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [showPreview, setShowPreview] = useState(false)

  const applyWrap = (before: string, after: string = before) => {
    const el = textareaRef.current
    if (!el) return
    const { selectionStart: start, selectionEnd: end } = el
    const selected = value.slice(start, end)
    const next = value.slice(0, start) + before + selected + after + value.slice(end)
    onChange(next)
    requestAnimationFrame(() => {
      el.focus()
      el.setSelectionRange(start + before.length, start + before.length + selected.length)
    })
  }

  const applyLinePrefix = (prefix: string) => {
    const el = textareaRef.current
    if (!el) return
    const { selectionStart: start, selectionEnd: end } = el
    const lineStart = value.lastIndexOf('\n', start - 1) + 1
    const lineEndIdx = value.indexOf('\n', end)
    const lineEnd = lineEndIdx === -1 ? value.length : lineEndIdx
    const block = value.slice(lineStart, lineEnd)
    const prefixed = block.split('\n').map((line) => prefix + line).join('\n')
    const next = value.slice(0, lineStart) + prefixed + value.slice(lineEnd)
    onChange(next)
    requestAnimationFrame(() => {
      el.focus()
      el.setSelectionRange(lineStart, lineStart + prefixed.length)
    })
  }

  const applyLink = () => {
    const el = textareaRef.current
    if (!el) return
    const { selectionStart: start, selectionEnd: end } = el
    const selected = value.slice(start, end) || '링크 텍스트'
    const markup = `[${selected}](url)`
    const next = value.slice(0, start) + markup + value.slice(end)
    onChange(next)
    requestAnimationFrame(() => {
      el.focus()
      const urlStart = start + selected.length + 3
      el.setSelectionRange(urlStart, urlStart + 3)
    })
  }

  return (
    <div className="overflow-hidden rounded-lg border border-input">
      <div className="flex items-center justify-between gap-2 border-b border-border bg-muted px-2 py-1.5">
        <div className="flex flex-wrap items-center gap-1">
          <ToolbarButton icon={Heading2} label="제목2" disabled={showPreview} onClick={() => applyLinePrefix('## ')} />
          <ToolbarButton icon={Heading3} label="제목3" disabled={showPreview} onClick={() => applyLinePrefix('### ')} />
          <ToolbarButton icon={Bold} label="굵게" disabled={showPreview} onClick={() => applyWrap('**')} />
          <ToolbarButton icon={Italic} label="기울임" disabled={showPreview} onClick={() => applyWrap('*')} />
          <ToolbarButton icon={List} label="목록" disabled={showPreview} onClick={() => applyLinePrefix('- ')} />
          <ToolbarButton icon={ListOrdered} label="번호 목록" disabled={showPreview} onClick={() => applyLinePrefix('1. ')} />
          <ToolbarButton icon={Link2} label="링크" disabled={showPreview} onClick={applyLink} />
          <ToolbarButton icon={Quote} label="인용" disabled={showPreview} onClick={() => applyLinePrefix('> ')} />
        </div>
        <button
          type="button"
          onClick={() => setShowPreview((v) => !v)}
          className="flex h-7 items-center gap-1 rounded px-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          {showPreview
            ? <><Pencil className="h-3.5 w-3.5" />편집</>
            : <><Eye className="h-3.5 w-3.5" />미리보기</>
          }
        </button>
      </div>

      {showPreview ? (
        <div className="max-h-[400px] overflow-y-auto bg-background px-4 py-3">
          {value.trim()
            ? <ReportMarkdown>{value}</ReportMarkdown>
            : <p className="text-sm text-muted-foreground">내용이 없습니다.</p>
          }
        </div>
      ) : (
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          rows={12}
          className="w-full resize-y bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none"
        />
      )}
    </div>
  )
}
