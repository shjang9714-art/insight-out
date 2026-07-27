import 'server-only'

import { llmCompleteDetailed } from '@/lib/llm'
import { looseJsonParse } from '@/lib/llm/parse'
import { stripLlmArtifacts } from '@/lib/text/strip-llm-artifacts'

// 지시서 A 백필 — 이미 저장된 entity_events(sentiment 기준)를
// LG U+ 자사 관점 biz_impact(crisis|opportunity|neutral)로 재판정한다.
// generate-events.ts 와 달리 원문 기사를 다시 읽지 않고, 이미 추출된 headline/detail만으로 재판정한다
// (사건 추출 자체는 바꾸지 않고 "이 사건이 자사에 미치는 영향"만 새로 매긴다).

const SYSTEM_PROMPT = `당신은 LG U+ B2B 전략 담당자다.
아래는 한 기업에 관해 이미 정리된 사건 목록이다. 각 사건이 LG U+에게 위기인지 기회인지 중립인지 판정하라.

판정 기준:
- 경쟁사(SKT, KT 등)의 수주·신제품·기술 우위·시장점유율 확대 등 성과는 LG U+ 관점에서 "crisis"(위기 — 경쟁 압박).
- LG U+ 자사의 성과, LG U+에 유리한 규제·시장 변화, LG U+가 진입할 여지가 있는 신시장·수요 신호는 "opportunity"(기회).
- 자사와 무관하거나 위기/기회 어느 쪽으로도 판단 근거가 약하면 "neutral".
- 사건에 붙어 있던 기존 논조(긍정/중립/부정)를 기계적으로 치환하지 말 것 — 사건 내용만 보고 자사 영향을 새로 판단.

규칙:
1. 입력에 주어진 id를 그대로 결과에 포함(새로 만들지 말 것).
2. 입력 개수만큼 정확히 결과를 반환.
3. JSON 배열만 출력.

출력 스키마 (배열):
[
  { "id": "입력 id 그대로", "biz_impact": "crisis|opportunity|neutral", "biz_impact_reason": "판정 근거 한 줄" }
]`

export interface BackfillEventInput {
  id: string
  event_date: string
  headline: string
  detail: string | null
  signal_type: string | null
}

export interface BackfillEventResult {
  id: string
  biz_impact: 'crisis' | 'opportunity' | 'neutral' | null
  biz_impact_reason: string | null
}

function buildUserPrompt(entityName: string, events: BackfillEventInput[]): string {
  const lines = events.map(e =>
    `[${e.id}] (${e.event_date}) ${e.headline}` +
    (e.detail ? `\n상세: ${e.detail}` : '') +
    (e.signal_type ? ` [신호: ${e.signal_type}]` : '')
  ).join('\n\n')

  return `기업: ${entityName}\n\n사건 목록:\n${lines}`
}

/** looseJsonParse는 배열 응답의 정규식 폴백이 없어 코드펜스 제거 후 순수 JSON.parse가 실패하면 null을 반환한다.
 *  이 모듈은 항상 배열을 기대하므로, looseJsonParse가 실패했을 때만 [...] 블록을 직접 한 번 더 시도한다. */
function parseArrayLoosely(raw: string): unknown {
  const parsed = looseJsonParse(raw)
  if (parsed !== null) return parsed

  const s = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim()
  const m = s.match(/\[[\s\S]*\]/)
  if (!m) return null
  try {
    return JSON.parse(m[0])
  } catch {
    return null
  }
}

function parseAndValidate(raw: string, validIdSet: Set<string>): BackfillEventResult[] {
  const parsed = parseArrayLoosely(raw)
  const arr = Array.isArray(parsed)
    ? parsed
    : (parsed && typeof parsed === 'object' && Array.isArray((parsed as Record<string, unknown>).events))
      ? (parsed as Record<string, unknown>).events as unknown[]
      : []

  const results: BackfillEventResult[] = []
  for (const item of arr) {
    if (!item || typeof item !== 'object') continue
    const ev = item as Record<string, unknown>

    const id = typeof ev.id === 'string' ? ev.id.trim() : ''
    if (!id || !validIdSet.has(id)) continue

    const rawBizImpact = typeof ev.biz_impact === 'string' ? ev.biz_impact.trim() : null
    const biz_impact = (rawBizImpact === 'crisis' || rawBizImpact === 'opportunity' || rawBizImpact === 'neutral')
      ? rawBizImpact
      : null

    const biz_impact_reason = typeof ev.biz_impact_reason === 'string' && ev.biz_impact_reason.trim()
      ? stripLlmArtifacts(ev.biz_impact_reason.trim())
      : null

    results.push({ id, biz_impact, biz_impact_reason })
  }
  return results
}

export interface ClassifyBizImpactResult {
  results: BackfillEventResult[]
  errorReason: string | null
}

/** 엔티티 하나의 기존 사건들을 배치로 재판정(엔티티당 LLM 1콜). */
export async function classifyEntityEventsBizImpact(
  entityName: string,
  events: BackfillEventInput[],
): Promise<ClassifyBizImpactResult> {
  if (events.length === 0) return { results: [], errorReason: null }

  const validIdSet = new Set(events.map(e => e.id))
  const { text: raw, errorReason } = await llmCompleteDetailed(
    'report', SYSTEM_PROMPT, buildUserPrompt(entityName, events)
  )
  if (!raw) {
    return { results: [], errorReason: errorReason ?? 'LLM 응답 없음' }
  }

  const results = parseAndValidate(raw, validIdSet)
  return {
    results,
    errorReason: results.length === 0 ? 'LLM 응답에서 유효한 판정을 추출하지 못함' : null,
  }
}
