import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { llmComplete } from '@/lib/llm'
import { looseJsonParse } from '@/lib/llm/parse'
import { retrieveForQuestion, type RagDoc } from './rag-retrieve'

// ─── 공개 타입 ────────────────────────────────────────────────────────────────

export type { RagDoc }

export interface RagAnswer {
  answer: string
  citations: string[]
  sources: RagDoc[]
}

export type RagResult =
  | RagAnswer
  | { answer: null; reason: 'no_results' | 'no_llm' }

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
{"answer":"답변 텍스트","citations":["content_id_1","content_id_2"]}`

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
{"answer":"답변 텍스트","citations":["content_id_1","content_id_2"]}`

function isQuestionLike(question: string): boolean {
  return /[?？！]/.test(question)
    || /(?:어떻게|어떤|무엇|왜|언제|어디서|어디|무슨)/.test(question)
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
  const docs = await retrieveForQuestion(admin, question)
  if (docs.length === 0) return { answer: null, reason: 'no_results' }

  // 2. LLM 호출
  const raw = await llmComplete(
    'search',
    isQuestionLike(question) ? SYSTEM_PROMPT : KEYWORD_SYSTEM_PROMPT,
    buildUserPrompt(question, docs),
    { allowFallbackPool: false },
  )
  if (!raw) return { answer: null, reason: 'no_llm' }

  // 3. 파싱
  const parsed = looseJsonParse(raw)
  if (!parsed || typeof parsed !== 'object') return { answer: null, reason: 'no_llm' }

  const obj = parsed as Record<string, unknown>
  const answer = typeof obj.answer === 'string' ? obj.answer.trim() : ''
  if (!answer) return { answer: null, reason: 'no_llm' }

  // 4. 환각 가드: citations ⊂ retrieved content_id
  const validIds = new Set(docs.map(d => d.content_id))
  const rawCitations = Array.isArray(obj.citations)
    ? (obj.citations as unknown[]).filter((c): c is string => typeof c === 'string')
    : []
  const citations = rawCitations.filter(id => validIds.has(id))

  // 5. sources: citations에 해당하는 RagDoc만.
  //    citations가 없으면(=근거 기사를 못 찾은 경우) 무관한 기사를 관련기사로
  //    노출하지 않도록 빈 배열 반환.
  const citationSet = new Set(citations)
  const sources = citations.length > 0
    ? docs.filter(d => citationSet.has(d.content_id))
    : []

  return { answer, citations, sources }
}
