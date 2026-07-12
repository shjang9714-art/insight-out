import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { llmComplete } from '@/lib/llm'
import { looseJsonParse } from '@/lib/llm/parse'
import { stripLlmArtifacts } from '@/lib/text/strip-llm-artifacts'

// ─── 공개 타입 ────────────────────────────────────────────────────────────────

export interface IssueBrief {
  situation: string       // 현황 2~3문장
  drivers: string[]       // 핵심 동인 2~4
  sentiment_read: string  // 논조 해석 1~2문장
  implications: string[]  // 시사점 2~3
  citations: string[]     // 근거 content_id (검증 통과분만)
}

// ─── 내부 타입 ────────────────────────────────────────────────────────────────

interface ContentInput {
  content_id: string
  title: string
  summary_ko: string | null
  sentiment: string | null
  signal_type: string | null
}

interface LlmOutput {
  situation: string
  drivers: unknown
  sentiment_read: string
  implications: unknown
  citations: unknown
}

// ─── 프롬프트 ─────────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `당신은 LG U+ B2B 시장 인텔리전스 분석가다.
아래 콘텐츠들을 근거로 이 이슈의 현황·핵심 동인·논조 해석·시사점을 한국어로 종합하라.
반드시 지켜야 할 규칙:
1. 추측 금지 — 제공된 사실만 기술.
2. 각 주장의 근거 content_id를 citations 배열에 명시.
3. citations는 반드시 입력 목록에 존재하는 content_id만 사용.
4. situation·drivers·sentiment_read·implications 등 서술 필드에는 <quote> 같은 태그나 대괄호 id([...])를 절대 넣지 말 것. 근거는 citations 배열로만 제공한다.
5. JSON만 출력. 다른 텍스트 포함 금지.

출력 스키마:
{
  "situation": "현황 2~3문장",
  "drivers": ["핵심 동인1", "핵심 동인2"],
  "sentiment_read": "논조 해석 1~2문장",
  "implications": ["시사점1", "시사점2"],
  "citations": ["content_id_1", "content_id_2"]
}`

function buildUserPrompt(
  issueTitle: string,
  contents: ContentInput[],
  signalSummary: string,
  sentimentSummary: string,
): string {
  const lines = contents
    .map(c => `[${c.content_id}] ${c.title}${c.summary_ko ? `\n요약: ${c.summary_ko}` : ''}${c.sentiment ? ` (논조: ${c.sentiment})` : ''}${c.signal_type ? ` [신호: ${c.signal_type}]` : ''}`)
    .join('\n\n')

  return `이슈: ${issueTitle}

신호 구성: ${signalSummary}
논조 분포: ${sentimentSummary}

근거 콘텐츠 (최대 40건):
${lines}`
}

// ─── 파싱·검증 ────────────────────────────────────────────────────────────────

function parseAndValidate(raw: string, validIdSet: Set<string>): IssueBrief | null {
  const parsed = looseJsonParse(raw)
  if (!parsed || typeof parsed !== 'object') return null
  const obj = parsed as Partial<LlmOutput>

  const situation = typeof obj.situation === 'string' ? obj.situation.trim() : ''
  const sentiment_read = typeof obj.sentiment_read === 'string' ? obj.sentiment_read.trim() : ''

  const drivers = Array.isArray(obj.drivers)
    ? (obj.drivers as unknown[]).filter((d): d is string => typeof d === 'string' && d.trim().length > 0)
    : []
  const implications = Array.isArray(obj.implications)
    ? (obj.implications as unknown[]).filter((i): i is string => typeof i === 'string' && i.trim().length > 0)
    : []

  // 환각 가드: content_id가 실제 이슈 콘텐츠 집합에 있는지 검증
  const rawCitations = Array.isArray(obj.citations)
    ? (obj.citations as unknown[]).filter((c): c is string => typeof c === 'string')
    : []
  const citations = rawCitations.filter(cid => validIdSet.has(cid))

  // 핵심 필드 비면 실패
  if (!situation || drivers.length === 0 || implications.length === 0) return null

  return {
    situation: stripLlmArtifacts(situation),
    drivers: drivers.map(stripLlmArtifacts),
    sentiment_read: stripLlmArtifacts(sentiment_read),
    implications: implications.map(stripLlmArtifacts),
    citations,
  }
}

// ─── 메인 함수 ────────────────────────────────────────────────────────────────

export async function generateIssueBrief(
  admin: SupabaseClient,
  issueId: string,
): Promise<{ brief: IssueBrief; model: string } | null> {
  try {
    // 1. 이슈 기본정보
    const { data: issueData } = await admin
      .from('issues')
      .select('id, title')
      .eq('id', issueId)
      .single()
    if (!issueData) return null
    const issue = issueData as { id: string; title: string }

    // 2. issue_contents → contents (최대 40건, 최신순)
    const { data: icData } = await admin
      .from('issue_contents')
      .select('content_id, contents!inner(id, title, summary_ko, sentiment)')
      .eq('issue_id', issueId)
      .limit(40)

    const icRows = (icData ?? []) as unknown as {
      content_id: string
      contents: { id: string; title: string; summary_ko: string | null; sentiment: string | null }
    }[]

    if (icRows.length === 0) return null

    const contentIds = icRows.map(r => r.content_id)
    const validIdSet = new Set(contentIds)

    // 3. content_signals — 대표 signal_type(score 최대) 맵
    const { data: signalData } = await admin
      .from('content_signals')
      .select('content_id, signal_type, score')
      .in('content_id', contentIds)

    const signalMap = new Map<string, string>()
    const signalTypeCount = new Map<string, number>()

    for (const row of (signalData ?? []) as { content_id: string; signal_type: string; score: number }[]) {
      // 대표 signal(score 최대)
      const existing = signalData
        ? (signalData as { content_id: string; signal_type: string; score: number }[])
            .filter(r => r.content_id === row.content_id)
            .sort((a, b) => b.score - a.score)[0]
        : null
      if (!signalMap.has(row.content_id) && existing) {
        signalMap.set(row.content_id, existing.signal_type)
      }
      signalTypeCount.set(row.signal_type, (signalTypeCount.get(row.signal_type) ?? 0) + 1)
    }

    const signalSummary = [...signalTypeCount.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([t, n]) => `${t} ${n}건`)
      .join(' · ') || '신호 없음'

    // 4. 논조 집계 요약
    const sentimentCount = { 긍정: 0, 중립: 0, 부정: 0 }
    for (const r of icRows) {
      const s = r.contents.sentiment
      if (s === '긍정' || s === '중립' || s === '부정') sentimentCount[s]++
    }
    const sentimentSummary = `긍정 ${sentimentCount.긍정} · 중립 ${sentimentCount.중립} · 부정 ${sentimentCount.부정}`

    // 5. 입력 조립
    const contents: ContentInput[] = icRows.map(r => ({
      content_id: r.content_id,
      title: r.contents.title,
      summary_ko: r.contents.summary_ko,
      sentiment: r.contents.sentiment,
      signal_type: signalMap.get(r.content_id) ?? null,
    }))

    // 6. LLM 호출
    const raw = await llmComplete(
      'report',
      SYSTEM_PROMPT,
      buildUserPrompt(issue.title, contents, signalSummary, sentimentSummary),
    )

    if (!raw) return null

    // 7. 파싱 + 환각 가드
    const brief = parseAndValidate(raw, validIdSet)
    if (!brief) return null

    // 8. 모델명 확인 (실제 사용 모델 추적용 — 간이 방식)
    const model = 'report'

    return { brief, model }
  } catch (err) {
    console.error('[IssueBrief] 생성 오류:', err instanceof Error ? err.message : String(err))
    return null
  }
}
