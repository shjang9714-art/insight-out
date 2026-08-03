import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { llmCompleteDetailed } from '@/lib/llm'
import { looseJsonParse } from '@/lib/llm/parse'
import { INTERROGATIVES, retrieveForQuestion, tokenizeQuestion, type RagDoc } from './rag-retrieve'

// ─── 공개 타입 ────────────────────────────────────────────────────────────────

export type { RagDoc }

export interface RagPoint {
  label: string
  detail: string
  evidence: string[]
}

export interface RagAnswer {
  summary: string
  points: RagPoint[]
  citations: string[]
  sources: RagDoc[]
}

export type RagResult =
  | RagAnswer
  // detail: 내부 실패 원인 — 관리자 응답에만 포함(route.ts에서 role 체크 후 부착/제거).
  | { answer: null; reason: 'no_results' | 'no_llm'; detail?: string }

// ─── 프롬프트 ─────────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `당신은 LG U+ B2B 시장 인텔리전스 어시스턴트다.
아래 제공된 기사들을 근거로만 질문에 한국어로 간결하게 답하라.

반드시 지켜야 할 규칙:
1. 추측·외부 지식 사용 금지 — 아래 기사에 없는 내용은 언급하지 말 것.
2. 근거가 부족하면 "제공된 자료로는 확인되지 않습니다"라고 답하라.
3. 각 핵심 주장에 근거 content_id를 citations 배열에 명시.
4. citations는 반드시 입력 기사 목록에 존재하는 content_id만 사용.
5. 답변은 3~5문장으로 간결하게.
6. JSON만 출력.

출력 스키마:
{"summary":"정의·핵심 1~2문장","points":[{"label":"짧은 소제목","detail":"1~2문장 설명","evidence":["content_id_1"]}],"citations":["content_id_1"]}`

const KEYWORD_SYSTEM_PROMPT = `당신은 LG U+ B2B 시장 인텔리전스 어시스턴트다.
아래 제공된 기사들을 근거로만 해당 주제의 최근 동향을 한국어 3~5문장으로 요약하라.

반드시 지켜야 할 규칙:
1. 추측·외부 지식 사용 금지 — 아래 기사에 없는 내용은 언급하지 말 것.
2. 근거가 부족하면 "제공된 자료로는 확인되지 않습니다"라고 답하라.
3. 각 핵심 주장에 근거 content_id를 citations 배열에 명시.
4. citations는 반드시 입력 기사 목록에 존재하는 content_id만 사용.
5. 답변은 3~5문장으로 간결하게.
6. JSON만 출력.

출력 스키마:
{"summary":"정의·핵심 1~2문장","points":[{"label":"짧은 소제목","detail":"1~2문장 설명","evidence":["content_id_1"]}],"citations":["content_id_1"]}`

function isQuestionLike(question: string): boolean {
  return /[?？]/.test(question)
    || INTERROGATIVES.some(word => question.includes(word))
}

function buildUserPrompt(question: string, docs: RagDoc[]): string {
  const docLines = docs.map(d =>
    `[${d.content_id}] (${d.published_at?.slice(0, 10) ?? '날짜미상'}) ${d.title}\n${d.snippet}`
  ).join('\n\n')
  return `질문: ${question}\n\n참고 기사:\n${docLines}`
}

// ─── 메인 함수 ────────────────────────────────────────────────────────────────

export async function answerQuestion(
  admin: SupabaseClient,
  question: string,
): Promise<RagResult> {
  // 1. 검색
  const tokens = tokenizeQuestion(question)
  const docs = await retrieveForQuestion(admin, question)

  // 어느 단계에서 끊겼는지 한 줄로 판별 가능하도록 매 반환 지점에서 로그.
  const logRag = (reason: string, detail: string) => {
    console.log(`[RAG] q="${question}" tokens=${tokens.length} docs=${docs.length} reason=${reason} detail=${detail}`)
  }

  if (docs.length === 0) {
    logRag('no_results', '')
    return { answer: null, reason: 'no_results' }
  }

  // 2. LLM 호출 — errorReason까지 받아서 detail로 threading.
  const { text: raw, errorReason } = await llmCompleteDetailed(
    'search',
    isQuestionLike(question) ? SYSTEM_PROMPT : KEYWORD_SYSTEM_PROMPT,
    buildUserPrompt(question, docs),
    { allowFallbackPool: false },
  )
  if (!raw) {
    const detail = errorReason ?? ''
    logRag('no_llm', detail)
    return { answer: null, reason: 'no_llm', detail }
  }

  // 3. 파싱
  const parsed = looseJsonParse(raw)
  if (!parsed || typeof parsed !== 'object') {
    logRag('no_llm', 'JSON 파싱 실패')
    return { answer: null, reason: 'no_llm', detail: 'JSON 파싱 실패' }
  }

  const obj = parsed as Record<string, unknown>
  const summary = typeof obj.summary === 'string' ? obj.summary.trim() : ''
  if (!summary) {
    logRag('no_llm', 'summary 없음')
    return { answer: null, reason: 'no_llm', detail: 'summary 없음' }
  }

  // 4. 환각 가드: citations·points.evidence ⊂ retrieved content_id
  const validIds = new Set(docs.map(d => d.content_id))
  const rawCitations = Array.isArray(obj.citations)
    ? (obj.citations as unknown[]).filter((c): c is string => typeof c === 'string')
    : []
  const citations = rawCitations.filter(id => validIds.has(id))

  const points = Array.isArray(obj.points)
    ? obj.points.flatMap((point): RagPoint[] => {
        if (!point || typeof point !== 'object') return []
        const value = point as Record<string, unknown>
        const label = typeof value.label === 'string' ? value.label.trim() : ''
        const detail = typeof value.detail === 'string' ? value.detail.trim() : ''
        const evidence = Array.isArray(value.evidence)
          ? value.evidence
            .filter((id): id is string => typeof id === 'string')
            .filter(id => validIds.has(id))
          : []
        if (!label || !detail || evidence.length === 0) return []
        return [{ label, detail, evidence }]
      })
    : []

  // 5. sources: citations에 해당하는 RagDoc만.
  //    citations가 없으면(=근거 기사를 못 찾은 경우) 무관한 기사를 관련기사로
  //    노출하지 않도록 빈 배열 반환.
  const citationSet = new Set(citations)
  const sources = citations.length > 0
    ? docs.filter(d => citationSet.has(d.content_id))
    : []

  logRag('ok', '')
  return { summary, points, citations, sources }
}
