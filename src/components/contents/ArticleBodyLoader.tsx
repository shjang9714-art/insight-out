'use client'

import { useEffect, useState } from 'react'
import { ExternalLink, Loader2 } from 'lucide-react'

type LoadState = 'loading' | 'done' | 'failed'

interface Props {
  contentId: string
  snippet: string
  originalUrl: string | null
}

// 잘린 문장 트리밍: "… - 디지털데일리" 또는 "...더보기" 패턴 제거
function trimTruncated(text: string): string {
  return text
    .replace(/[\s…\.]+[-–—]\s*[\p{L}\w]+\s*$/u, '…')
    .replace(/[\s]*(?:\.{2,}|…+)\s*더보기\s*$/u, '…')
    .trim()
}

export default function ArticleBodyLoader({ contentId, snippet, originalUrl }: Props) {
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
        setState(status === 'done' && cleaned ? 'done' : 'failed')
        setBody(cleaned)
      })
      .catch(() => {
        clearTimeout(timeoutId)
        // abort 에러면 timeout이 이미 setState('failed')를 호출했으므로 중복 방지
        setState((prev) => (prev === 'loading' ? 'failed' : prev))
      })

    return () => {
      controller.abort()
      clearTimeout(timeoutId)
    }
  }, [contentId])

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

  if (state === 'failed' || !body) {
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

  return (
    <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">{body}</p>
  )
}
