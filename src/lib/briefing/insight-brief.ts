import 'server-only'

import { llmComplete } from '@/lib/llm'

// ─── 타입 ─────────────────────────────────────────────────────────────────────

export interface InsightBrief {
  keyChanges: string[]
  risks: string[]
  keywords: string[]
  myImplication: string | null
  source: 'rule' | 'llm'
}

export interface BriefInput {
  trendingTopics: { group: string; cur: number; changePct: number | null }[]
  risingKeywords: string[]
  watchlistHits: { company: string; count: number }[]
  riskKeywords: string[]
}

// ─── 리스크 어휘 사전 ─────────────────────────────────────────────────────────

const RISK_VOCAB = ['전력', '냉각', '공급망', 'GPU', '입지', '병목', '규제', '소송', '유출', '중단']

export { RISK_VOCAB }

// ─── 규칙 기반 브리핑 ─────────────────────────────────────────────────────────

export function buildRuleBrief(input: BriefInput): InsightBrief {
  const { trendingTopics, risingKeywords, watchlistHits, riskKeywords } = input

  const keyChanges: string[] = []

  for (const t of trendingTopics.slice(0, 2)) {
    if (t.changePct === null) {
      keyChanges.push(`'${t.group}' 관련 이슈가 이번 주 처음 등장했습니다. (${t.cur}건)`)
    } else if (t.changePct >= 0) {
      keyChanges.push(`'${t.group}' 관련 이슈가 전주 대비 ${t.changePct}% 증가했습니다. (${t.cur}건)`)
    }
  }

  if (watchlistHits.length > 0) {
    const names = watchlistHits.slice(0, 2).map(h => h.company).join(', ')
    keyChanges.push(`관심 기업(${names})이 최근 주요 이슈에 등장했습니다.`)
  }

  if (keyChanges.length === 0 && risingKeywords.length > 0) {
    keyChanges.push(`'${risingKeywords.slice(0, 3).join('·')}' 키워드가 이번 주 상승했습니다.`)
  }

  const risks = riskKeywords.length > 0
    ? [`${riskKeywords.slice(0, 3).join('·')} 관련 키워드가 함께 증가하고 있습니다.`]
    : []

  const myImplication = watchlistHits.length > 0
    ? `관심 기업(${watchlistHits[0].company}) 관련 이슈 동향을 점검하세요.`
    : trendingTopics.length > 0
    ? `'${trendingTopics[0].group}' 이슈가 업무에 미치는 영향을 검토하세요.`
    : null

  return {
    keyChanges,
    risks,
    keywords: risingKeywords.slice(0, 6),
    myImplication,
    source: 'rule',
  }
}

// ─── LLM 고도화 (실패 시 rule 폴백) ──────────────────────────────────────────

const SYSTEM_PROMPT = `당신은 B2B 통신·엔터프라이즈 시장 분석 전문가입니다. 주어진 집계 데이터를 바탕으로 간결하고 통찰력 있는 브리핑을 한국어로 작성하세요.
응답은 반드시 아래 JSON만 출력하세요 (마크다운 없이 순수 JSON):
{"keyChanges":["문장1","문장2","문장3"],"risks":["문장"],"keywords":["키워드1","키워드2"],"myImplication":"시사점 한 줄"}`

function buildUserPrompt(input: BriefInput, rule: InsightBrief): string {
  return `이번 주 집계 데이터:
- 급상승 토픽: ${input.trendingTopics.slice(0, 5).map(t => `${t.group}(${t.cur}건${t.changePct !== null ? ` +${t.changePct}%` : ' 신규'})`).join(', ') || '없음'}
- 상승 키워드: ${input.risingKeywords.join(', ') || '없음'}
- 리스크 키워드: ${input.riskKeywords.join(', ') || '없음'}
- 관심기업 등장: ${input.watchlistHits.map(h => h.company).join(', ') || '없음'}
규칙 기반 초안: ${JSON.stringify({ keyChanges: rule.keyChanges, risks: rule.risks, myImplication: rule.myImplication })}`
}

export async function enhanceBriefWithLlm(rule: InsightBrief, input: BriefInput): Promise<InsightBrief> {
  try {
    const out = await llmComplete('briefing', SYSTEM_PROMPT, buildUserPrompt(input, rule))
    if (!out) return rule

    const cleaned = out.replace(/```json|```/g, '').trim()
    const parsed = JSON.parse(cleaned) as Partial<Record<string, unknown>>

    if (!Array.isArray(parsed.keyChanges) || !Array.isArray(parsed.risks)) return rule

    return {
      keyChanges: (parsed.keyChanges as string[]).filter(s => typeof s === 'string').slice(0, 3),
      risks: (parsed.risks as string[]).filter(s => typeof s === 'string').slice(0, 2),
      keywords: Array.isArray(parsed.keywords)
        ? (parsed.keywords as string[]).filter(s => typeof s === 'string').slice(0, 6)
        : rule.keywords,
      myImplication: typeof parsed.myImplication === 'string' ? parsed.myImplication : rule.myImplication,
      source: 'llm',
    }
  } catch {
    return rule
  }
}
