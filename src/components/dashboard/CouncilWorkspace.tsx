'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { ExternalLink } from 'lucide-react'

// ─── COUNCIL 임베드 프로토콜 (council/lib/embed/protocol.ts 와 동일 사본) ─────────
const COUNCIL_EMBED_PROTOCOL = 'council-embed/v1'
const COUNCIL_URL = process.env.NEXT_PUBLIC_COUNCIL_URL ?? 'http://localhost:3000'

function councilOrigin(): string {
  try {
    return new URL(COUNCIL_URL).origin
  } catch {
    return '*'
  }
}

interface EmbedSource {
  title: string
  url?: string
}
interface ResultPayload {
  sessionId: string
  title: string
  concern: string
  conclusion: unknown
}

/**
 * AI 협의체(COUNCIL) 임베드 워크스페이스.
 *
 * insight-out 대시보드 안에 COUNCIL 을 iframe 으로 띄우고,
 * MI 관점의 토론 컨텍스트를 postMessage 로 주입한다.
 *
 * 딥링크: /dashboard/council?topic=<고민>&context=<메모>
 *   다른 인사이트/리포트 화면에서 "Council에서 토론하기" 로 진입할 때 사용.
 * COUNCIL 이 'ready' 를 보내오면 그때 컨텍스트를 주입하고,
 * 토론 결론('result')을 받으면 상단 배너로 표시한다.
 */
export default function CouncilWorkspace() {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const searchParams = useSearchParams()
  const [result, setResult] = useState<ResultPayload | null>(null)

  const pendingConcern =
    searchParams.get('topic') ?? searchParams.get('concern') ?? ''
  const pendingContext = searchParams.get('context') ?? ''

  const sendContext = useCallback(
    (concern: string, note?: string, sources?: EmbedSource[]) => {
      const frame = iframeRef.current?.contentWindow
      if (!frame || !concern.trim()) return
      frame.postMessage(
        {
          protocol: COUNCIL_EMBED_PROTOCOL,
          type: 'set-context',
          payload: { concern, note, sources },
        },
        councilOrigin(),
      )
    },
    [],
  )

  useEffect(() => {
    const origin = councilOrigin()
    const onMessage = (event: MessageEvent) => {
      if (origin !== '*' && event.origin !== origin) return
      const data = event.data
      if (!data || data.protocol !== COUNCIL_EMBED_PROTOCOL) return

      if (data.type === 'ready') {
        if (pendingConcern) {
          sendContext(pendingConcern, pendingContext || undefined)
        }
      } else if (data.type === 'result') {
        setResult(data.payload as ResultPayload)
      }
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [pendingConcern, pendingContext, sendContext])

  return (
    <div className="relative flex h-[calc(100vh-10rem)] flex-col gap-2">
      {result && (
        <div className="rounded-lg border border-brand-200 bg-brand-50 px-4 py-3 dark:bg-brand-950/30">
          <p className="text-xs font-semibold uppercase tracking-wider text-brand-600">
            토론 결론 도착
          </p>
          <p className="mt-1 text-sm font-medium text-foreground">
            {result.title}
          </p>
        </div>
      )}

      <iframe
        ref={iframeRef}
        src={COUNCIL_URL}
        title="AI 협의체"
        className="min-h-0 w-full flex-1 rounded-xl bg-background"
        allow="clipboard-write"
      />

      {/* 새 탭에서 열기 — iframe 위 우상단에 은은하게 */}
      <a
        href={COUNCIL_URL}
        target="_blank"
        rel="noopener noreferrer"
        title="새 탭에서 열기"
        className="absolute right-3 top-3 z-10 inline-flex items-center gap-1 rounded-md bg-background/70 px-2 py-1 text-[11px] text-muted-foreground backdrop-blur transition-colors hover:text-foreground"
      >
        <ExternalLink className="h-3 w-3" />
      </a>
    </div>
  )
}
