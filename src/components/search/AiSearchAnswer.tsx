'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Search, Sparkles } from 'lucide-react'
import AiMark from '@/components/ui/AiMark'

interface RagSource {
  content_id: string
  title: string
  summary_ko: string | null
  published_at: string | null
  source: string | null
}

interface RagPoint {
  label: string
  detail: string
  evidence: string[]
}

interface RagAnswer {
  summary: string
  points: RagPoint[]
  sources: RagSource[]
}

function isRagSource(value: unknown): value is RagSource {
  if (!value || typeof value !== 'object') return false
  const source = value as Record<string, unknown>
  return (
    typeof source.content_id === 'string'
    && typeof source.title === 'string'
    && (source.summary_ko === null || typeof source.summary_ko === 'string')
    && (source.published_at === null || typeof source.published_at === 'string')
    && (source.source === null || typeof source.source === 'string')
  )
}

function parseRagAnswer(value: unknown): RagAnswer | null {
  if (!value || typeof value !== 'object') return null
  const result = value as Record<string, unknown>
  if (typeof result.summary !== 'string' || !Array.isArray(result.sources)) return null

  const points = Array.isArray(result.points)
    ? result.points.flatMap((point): RagPoint[] => {
        if (!point || typeof point !== 'object') return []
        const item = point as Record<string, unknown>
        if (
          typeof item.label !== 'string'
          || typeof item.detail !== 'string'
          || !Array.isArray(item.evidence)
        ) return []
        const evidence = item.evidence.filter((id): id is string => typeof id === 'string')
        return evidence.length > 0
          ? [{ label: item.label, detail: item.detail, evidence }]
          : []
      })
    : []

  return {
    summary: result.summary,
    points,
    sources: result.sources.filter(isRagSource),
  }
}

function normalizeQuestion(question: string): string {
  return question.trim().replace(/\s+/g, ' ').toLowerCase()
}

// 검색 실패 사유 — 화면에 다른 안내를 보여주기 위해 구분한다.
// 'empty'는 근거 기사를 못 찾은 경우(검색어 문제), 'error'는 그 외 모든 실패(LLM/네트워크/서버 오류).
type FetchOutcome =
  | { kind: 'answer'; answer: RagAnswer }
  | { kind: 'empty' }
  | { kind: 'error' }

// 모듈 캐시: 컴포넌트가 질의·필터 변경으로 재마운트되어도 같은 질의를 재호출하지 않는다.
// 성공(answer)만 캐싱한다 — 실패는 아래에서 즉시 delete하여 재검색 시 새 fetch가 나가게 한다.
const answerCache = new Map<string, Promise<FetchOutcome>>()

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

function fetchAnswer(question: string): Promise<FetchOutcome> {
  const key = normalizeQuestion(question)
  const cached = answerCache.get(key)
  if (cached) return cached

  const request = fetch('/api/search/rag', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question }),
  })
    .then(async response => {
      let body: unknown
      try {
        body = await response.json()
      } catch {
        return { kind: 'error' } as const
      }
      const reason = (
        typeof body === 'object' && body !== null
          ? (body as Record<string, unknown>).reason
          : undefined
      )
      if (!response.ok) return { kind: 'error' } as const
      if (reason === 'no_results') return { kind: 'empty' } as const
      if (reason === 'no_llm') return { kind: 'error' } as const
      const answer = parseRagAnswer(body)
      return answer ? ({ kind: 'answer', answer } as const) : ({ kind: 'error' } as const)
    })
    .catch(() => ({ kind: 'error' }) as const)

  answerCache.set(key, request)
  // 실패(answer 아님)는 캐시에 남기지 않는다 — 그래야 재검색이 새 fetch를 실제로 낸다.
  void request.then(outcome => {
    if (outcome.kind !== 'answer') answerCache.delete(key)
  })
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

// 실패 안내 카드 — 답변 카드와 같은 톤이되 채도를 낮춰, 조용히 사라지지 않고 남아 있는다.
function ReasonCard({ message }: { message: string }) {
  return (
    <div className="mb-5 flex items-center gap-2.5 rounded-xl border border-border bg-muted/30 px-5 py-4 text-sm text-muted-foreground">
      <Sparkles className="h-4 w-4 shrink-0 text-muted-foreground/70" />
      <span>{message}</span>
    </div>
  )
}

function EvidenceChips({ evidence }: { evidence: string[] }) {
  const visible = evidence.slice(0, 2)
  const remaining = evidence.length - visible.length

  return (
    <span className="ml-2 inline-flex items-center gap-1 align-middle">
      {visible.map((contentId, index) => (
        <Link
          key={contentId}
          href={`/dashboard/contents/${contentId}`}
          prefetch={false}
          className="rounded-md border border-brand-200 bg-brand-50 px-1.5 py-0.5 text-[10px] font-medium text-brand-700 hover:bg-brand-100"
        >
          근거 {index + 1}
        </Link>
      ))}
      {remaining > 0 && (
        <span className="text-[10px] font-medium text-muted-foreground">+{remaining}</span>
      )}
    </span>
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
        <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">{answer.summary}</p>

        {answer.points.length > 0 && (
          <div className="border-t border-border pt-3">
            <h3 className="mb-2 text-sm font-semibold text-foreground">주요 내용</h3>
            <ul className="space-y-2.5 text-sm leading-relaxed text-foreground">
              {answer.points.map(point => (
                <li key={`${point.label}-${point.detail}`} className="flex items-start gap-2">
                  <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-600" />
                  <p>
                    <strong className="font-semibold">{point.label}</strong>
                    <span>: {point.detail}</span>
                    <EvidenceChips evidence={point.evidence} />
                  </p>
                </li>
              ))}
            </ul>
          </div>
        )}
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
                    {source.summary_ko && (
                      <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                        {source.summary_ko}
                      </p>
                    )}
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
  const [state, setState] = useState<'loading' | 'done' | 'empty' | 'error'>('loading')
  const [stateQuestion, setStateQuestion] = useState<string | null>(null)
  const normalized = normalizeQuestion(question)

  useEffect(() => {
    if (normalized.length < 2) return

    let cancelled = false

    fetchStatus().then(enabled => {
      if (cancelled) return
      // 기능 자체가 꺼져 있으면(활성 라우팅 없음) 아무것도 그리지 않는다 — 실패 안내와는 다른 경우.
      if (!enabled) return

      setStateQuestion(normalized)
      setState('loading')
      fetchAnswer(question).then(outcome => {
        if (cancelled) return
        if (outcome.kind === 'answer') setState('done')
        else if (outcome.kind === 'empty') setState('empty')
        else setState('error')
      })
    })

    return () => { cancelled = true }
  }, [normalized, question])

  if (normalized.length < 2) return null
  if (stateQuestion !== normalized) return null
  if (state === 'loading') return <LoadingAnswer />
  if (state === 'empty') {
    return <ReasonCard message="검색어와 맞는 기사를 찾지 못해 AI 답변을 만들지 않았어요." />
  }
  if (state === 'error') {
    return <ReasonCard message="AI 답변을 만들지 못했어요. 잠시 후 다시 시도해주세요." />
  }

  const cached = answerCache.get(normalizeQuestion(question))
  return cached ? <AnswerFromCache request={cached} /> : null
}

function AnswerFromCache({ request }: { request: Promise<FetchOutcome> }) {
  const [answer, setAnswer] = useState<RagAnswer | null>(null)

  useEffect(() => {
    let cancelled = false
    request.then(outcome => {
      if (!cancelled && outcome.kind === 'answer') setAnswer(outcome.answer)
    })
    return () => { cancelled = true }
  }, [request])

  return answer ? <AnswerCard answer={answer} /> : null
}
