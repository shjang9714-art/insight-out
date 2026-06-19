'use client'

import { useEffect, useState } from 'react'
import { ExternalLink, Loader2 } from 'lucide-react'

type LoadState = 'loading' | 'loaded' | 'empty' | 'failed'

interface Props {
  contentId: string
  contentTitle: string
  snippet: string
  originalUrl: string | null
}

function trimTruncated(text: string): string {
  return text
    .replace(/[\s…\.]+[-–—]\s*[\p{L}\w]+\s*$/u, '…')
    .replace(/[\s]*(?:\.{2,}|…+)\s*더보기\s*$/u, '…')
    .trim()
}

function isBodyEffectivelyEmpty(body: string, title: string): boolean {
  if (!body || body.length < 30) return true
  const norm = (s: string) => s.replace(/[\s\n\r\t.,!?·…\-–—"''""\[\]()]/g, '').toLowerCase()
  const normBody = norm(body)
  const normTitle = norm(title)
  if (normTitle && normBody.length <= normTitle.length * 1.3 && normBody.includes(normTitle)) return true
  return false
}

export default function ArticleBodyLoader({ contentId, contentTitle, snippet, originalUrl }: Props) {
  const [state, setState] = useState<LoadState>('loading')
  const [body, setBody] = useState('')

  useEffect(() => {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => {
      controller.abort()
      setState('failed')
    }, 10_000)

    fetch(`/api/contents/${contentId}/body`, { signal: controller.signal })
      .then((r) => r.json())
      .then(({ status, body: rawBody }: { status: string; body: string }) => {
        clearTimeout(timeoutId)
        const cleaned = trimTruncated(rawBody)
        if (status !== 'done' || !cleaned) {
          setState('empty')
        } else if (isBodyEffectivelyEmpty(cleaned, contentTitle)) {
          setState('empty')
        } else {
          setState('loaded')
          setBody(cleaned)
        }
      })
      .catch(() => {
        clearTimeout(timeoutId)
        setState((prev) => (prev === 'loading' ? 'failed' : prev))
      })

    return () => {
      controller.abort()
      clearTimeout(timeoutId)
    }
  }, [contentId, contentTitle])

  if (state === 'loading') {
    return (
      <div>
        {snippet && (
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground opacity-60">
            {snippet}
          </p>
        )}
        <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          <span>본문을 불러오는 중입니다…</span>
        </div>
      </div>
    )
  }

  if (state === 'loaded') {
    return (
      <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">{body}</p>
    )
  }

  if (state === 'empty') {
    return (
      <div className="mt-2 rounded-lg border border-dashed border-border p-5 text-center">
        <p className="text-sm text-muted-foreground">
          본문 미수집 콘텐츠입니다. 원문 보기로 확인하세요.
        </p>
        {originalUrl && (
          <a
            href={originalUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-brand-600 bg-brand-50 px-4 py-2 text-sm font-medium text-brand-600 transition-colors hover:bg-brand-100 dark:bg-brand-950/30 dark:hover:bg-brand-950/50"
          >
            <ExternalLink className="h-4 w-4" />
            원문 보기
          </a>
        )}
      </div>
    )
  }

  return (
    <div>
      {snippet && (
        <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
          {trimTruncated(snippet)}
        </p>
      )}
      <div className="mt-6 rounded-lg border border-dashed border-border p-4">
        <p className="text-sm text-muted-foreground">
          본문 미리보기는 여기까지예요. 전체 내용은 원문에서 확인하세요.
        </p>
        {originalUrl && (
          <a
            href={originalUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 inline-flex items-center gap-1.5 text-sm font-medium text-brand-600 hover:underline"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            원문 보기
          </a>
        )}
      </div>
    </div>
  )
}
