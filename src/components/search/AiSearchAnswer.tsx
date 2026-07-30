'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import AiMark from '@/components/ui/AiMark'

interface RagSource {
  content_id: string
  title: string
  published_at: string | null
  source: string | null
}

interface RagAnswer {
  answer: string
  sources: RagSource[]
}

function isRagSource(value: unknown): value is RagSource {
  if (!value || typeof value !== 'object') return false
  const source = value as Record<string, unknown>
  return (
    typeof source.content_id === 'string'
    && typeof source.title === 'string'
    && (source.published_at === null || typeof source.published_at === 'string')
    && (source.source === null || typeof source.source === 'string')
  )
}

function parseRagAnswer(value: unknown): RagAnswer | null {
  if (!value || typeof value !== 'object') return null
  const result = value as Record<string, unknown>
  if (typeof result.answer !== 'string' || !Array.isArray(result.sources)) return null
  return {
    answer: result.answer,
    sources: result.sources.filter(isRagSource),
  }
}

export default function AiSearchAnswer({ question }: { question: string }) {
  const [isEnabled, setEnabled] = useState(false)
  const [isChecking, setChecking] = useState(true)
  const [isLoading, setLoading] = useState(false)
  const [hasRequested, setHasRequested] = useState(false)
  const [result, setResult] = useState<RagAnswer | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    fetch('/api/search/rag/status', { cache: 'no-store' })
      .then(async response => {
        const body = await response.json() as unknown
        if (!cancelled) {
          const enabled = (
            response.ok
            && typeof body === 'object'
            && body !== null
            && (body as Record<string, unknown>).enabled === true
          )
          setEnabled(enabled)
          setChecking(false)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setEnabled(false)
          setChecking(false)
        }
      })

    return () => { cancelled = true }
  }, [])

  const handleRequest = async () => {
    if (hasRequested || isLoading) return

    setHasRequested(true)
    setLoading(true)
    setMessage(null)

    try {
      const response = await fetch('/api/search/rag', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question }),
      })
      const body = await response.json() as unknown

      if (
        typeof body === 'object'
        && body !== null
        && (body as Record<string, unknown>).reason === 'no_llm'
      ) {
        setEnabled(false)
        return
      }

      if (
        typeof body === 'object'
        && body !== null
        && (body as Record<string, unknown>).reason === 'no_results'
      ) {
        setMessage('답변의 근거가 될 자료를 찾지 못했습니다.')
        return
      }

      const parsed = parseRagAnswer(body)
      if (!response.ok || !parsed) {
        setMessage('AI 답변을 불러오지 못했습니다. 잠시 후 다시 시도해주세요.')
        return
      }

      setResult(parsed)
    } catch {
      setMessage('AI 답변을 불러오지 못했습니다. 잠시 후 다시 시도해주세요.')
    } finally {
      setLoading(false)
    }
  }

  if (isChecking || !isEnabled) return null

  if (!result && !message) {
    return (
      <div className="mb-6">
        <button
          type="button"
          onClick={() => void handleRequest()}
          disabled={hasRequested || isLoading}
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isLoading ? 'AI 답변 생성 중...' : 'AI 답변 보기'}
        </button>
      </div>
    )
  }

  return (
    <section className="mb-6 rounded-xl border border-brand-200 bg-card p-6">
      <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
        <AiMark title="AI 생성 답변" />
        AI 답변
      </h2>

      {result ? (
        <>
          <p className="whitespace-pre-wrap text-sm leading-7 text-foreground">{result.answer}</p>
          {result.sources.length > 0 && (
            <div className="mt-5 border-t border-border pt-4">
              <h3 className="mb-2 text-xs font-semibold text-muted-foreground">근거 자료</h3>
              <ul className="space-y-1.5">
                {result.sources.map(source => (
                  <li key={source.content_id} className="text-xs">
                    <Link
                      href={`/dashboard/contents/${source.content_id}`}
                      prefetch={false}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-medium text-foreground hover:text-brand-600"
                    >
                      {source.title}
                    </Link>
                    <span className="ml-2 text-muted-foreground">
                      {[source.source, source.published_at?.slice(0, 10)].filter(Boolean).join(' · ')}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      ) : (
        <p className="text-sm text-muted-foreground">{message}</p>
      )}
    </section>
  )
}
