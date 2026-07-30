'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Search, Sparkles } from 'lucide-react'
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

function normalizeQuestion(question: string): string {
  return question.trim().replace(/\s+/g, ' ').toLowerCase()
}

// 모듈 캐시: 컴포넌트가 질의·필터 변경으로 재마운트되어도 같은 질의를 재호출하지 않는다.
const answerCache = new Map<string, Promise<RagAnswer | null>>()

function fetchStatus(): Promise<boolean> {
  return fetch('/api/search/rag/status', { cache: 'no-store' })
    .then(async response => {
      const body = await response.json() as unknown
      return (
        response.ok
        && typeof body === 'object'
        && body !== null
        && (body as Record<string, unknown>).enabled === true
      )
    })
    .catch(() => false)
}

function fetchAnswer(question: string): Promise<RagAnswer | null> {
  const key = normalizeQuestion(question)
  const cached = answerCache.get(key)
  if (cached) return cached

  const request = fetch('/api/search/rag', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question }),
  })
    .then(async response => {
      const body = await response.json() as unknown
      const reason = (
        typeof body === 'object' && body !== null
          ? (body as Record<string, unknown>).reason
          : undefined
      )
      if (!response.ok || reason === 'no_results' || reason === 'no_llm') return null
      return parseRagAnswer(body)
    })
    .catch(() => null)

  answerCache.set(key, request)
  return request
}

function LoadingAnswer() {
  return (
    <div className="mb-5 flex items-center gap-2.5 rounded-xl border border-brand-100 bg-brand-50/60 px-5 py-4 text-sm font-medium text-brand-700">
      <Sparkles className="h-4 w-4 shrink-0 animate-pulse text-brand-600" />
      <span>AI가 수집된 기사를 바탕으로 답변을 작성하고 있어요</span>
      <span className="ml-0.5 flex items-center gap-1">
        <span className="h-2 w-2 animate-bounce rounded-full bg-brand-600 [animation-delay:-0.3s]" />
        <span className="h-2 w-2 animate-bounce rounded-full bg-brand-600 [animation-delay:-0.15s]" />
        <span className="h-2 w-2 animate-bounce rounded-full bg-brand-600" />
      </span>
    </div>
  )
}

function AnswerCard({ answer }: { answer: RagAnswer }) {
  return (
    <>
      <div className="mb-4 space-y-3 rounded-xl border border-border bg-card px-5 py-4">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 shrink-0 text-brand-600" />
          <AiMark title="AI 생성 답변" size="sm" />
          <span className="text-sm font-semibold text-foreground">AI 답변</span>
          <span className="text-xs text-muted-foreground">수집된 기사들을 근거로 정리했어요.</span>
        </div>
        <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">{answer.answer}</p>
      </div>

      {answer.sources.length > 0 && (
        <div className="mb-5 rounded-xl border border-border bg-card px-5 py-4">
          <div className="mb-1 flex items-center gap-2">
            <Search className="h-4 w-4 shrink-0 text-brand-600" />
            <span className="text-sm font-semibold text-foreground">관련 기사</span>
            <span className="text-xs text-muted-foreground">답변의 근거예요. 관련 기사를 확인하세요.</span>
          </div>
          <ul className="divide-y divide-border">
            {answer.sources.map(source => (
              <li key={source.content_id}>
                <Link
                  href={`/dashboard/contents/${source.content_id}`}
                  prefetch={false}
                  className="group -mx-2 flex items-start gap-2.5 rounded-lg px-2 py-2.5 transition-colors hover:bg-muted/50"
                >
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-600" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium leading-snug text-foreground group-hover:text-brand-600">
                      {source.title}
                    </p>
                    {(source.source || source.published_at) && (
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {[source.source, source.published_at?.slice(0, 10).replace(/-/g, '.')]
                          .filter(Boolean)
                          .join('  ·  ')}
                      </p>
                    )}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  )
}

export default function AiSearchAnswer({ question }: { question: string }) {
  const [state, setState] = useState<'loading' | 'done' | 'none'>('none')
  const [stateQuestion, setStateQuestion] = useState<string | null>(null)
  const normalized = normalizeQuestion(question)

  useEffect(() => {
    if (normalized.length < 2) return

    let cancelled = false

    fetchStatus().then(enabled => {
      if (cancelled) return
      if (!enabled) {
        setStateQuestion(normalized)
        setState('none')
        return
      }

      setStateQuestion(normalized)
      setState('loading')
      fetchAnswer(question).then(answer => {
        if (!cancelled) setState(answer ? 'done' : 'none')
      })
    })

    return () => { cancelled = true }
  }, [normalized, question])

  if (normalized.length < 2) return null
  if (stateQuestion !== normalized) return null
  if (state === 'loading') return <LoadingAnswer />
  if (state !== 'done') return null

  const cached = answerCache.get(normalizeQuestion(question))
  return cached ? <AnswerFromCache request={cached} /> : null
}

function AnswerFromCache({ request }: { request: Promise<RagAnswer | null> }) {
  const [answer, setAnswer] = useState<RagAnswer | null>(null)

  useEffect(() => {
    let cancelled = false
    request.then(value => { if (!cancelled) setAnswer(value) })
    return () => { cancelled = true }
  }, [request])

  return answer ? <AnswerCard answer={answer} /> : null
}
