import 'server-only'
import { llmComplete } from '@/lib/llm'
import { looseJsonParse } from '@/lib/llm/parse'

export interface SemanticCandidate {
  id: string
  title: string
  summary_ko: string | null
}

export interface SemanticFilterResult {
  matchedIds: string[]
  mode: 'llm' | 'keyword-fallback'
}

const BATCH_SIZE = 20
const MAX_BATCHES = 6

const SYSTEM_PROMPT = `당신은 LG U+ B2B 시장 인텔리전스 분석가다.
하나의 "이슈(테마)"와 기사 목록이 주어진다. 각 기사가 이 이슈 테마에
**실제로 속하는지** 의미로 판단하라. 키워드가 글자만 겹치고 주제가 다르면 제외.

규칙:
1. 제공된 id만 출력. 새 id 지어내기 금지.
2. 애매하면 제외(정밀도 우선).
3. JSON 객체 1개만 출력. 설명 금지.

출력 스키마:
{ "matched_ids": ["속하는 기사 id만"] }`

function buildUserPrompt(
  issue: { title: string; summary: string | null },
  batch: SemanticCandidate[],
): string {
  const lines = batch
    .map(c => `[${c.id}] ${c.title}` + (c.summary_ko ? `\n요약: ${c.summary_ko}` : ''))
    .join('\n\n')
  return `이슈: ${issue.title}` +
    (issue.summary ? `\n이슈 요약: ${issue.summary}` : '') +
    `\n\n기사 목록:\n${lines}`
}

function parseMatchedIds(raw: string, validIds: Set<string>): string[] | null {
  const parsed = looseJsonParse(raw)
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null
  const arr = (parsed as Record<string, unknown>).matched_ids
  if (!Array.isArray(arr)) return null
  return arr.filter((x): x is string => typeof x === 'string' && validIds.has(x))
}

/**
 * 키워드로 추린 후보를 LLM으로 의미 검증.
 * LLM 키 없음/전 배치 실패 → 후보 전체 반환(키워드 폴백, 회귀 0).
 * 일부 배치 실패 → 성공 배치는 LLM 결과, 실패 배치는 후보 통과(recall 유지).
 */
export async function semanticFilterIssueContents(
  issue: { title: string; summary: string | null },
  candidates: SemanticCandidate[],
): Promise<SemanticFilterResult> {
  if (candidates.length === 0) return { matchedIds: [], mode: 'keyword-fallback' }

  const batches: SemanticCandidate[][] = []
  for (let i = 0; i < candidates.length && batches.length < MAX_BATCHES; i += BATCH_SIZE) {
    batches.push(candidates.slice(i, i + BATCH_SIZE))
  }
  // 예산 초과분은 검증 없이 후보 통과
  const overflow = candidates.slice(MAX_BATCHES * BATCH_SIZE).map(c => c.id)

  const matched = new Set<string>(overflow)
  let anyLlmOk = false

  for (const batch of batches) {
    const validIds = new Set(batch.map(c => c.id))
    try {
      const raw = await llmComplete('classify', SYSTEM_PROMPT, buildUserPrompt(issue, batch))
      const ids = raw ? parseMatchedIds(raw, validIds) : null
      if (ids) {
        anyLlmOk = true
        ids.forEach(id => matched.add(id))
      } else {
        batch.forEach(c => matched.add(c.id))
      }
    } catch {
      batch.forEach(c => matched.add(c.id))
    }
  }

  return {
    matchedIds: [...matched],
    mode: anyLlmOk ? 'llm' : 'keyword-fallback',
  }
}
