import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { llmCompleteDetailed } from '@/lib/llm'
import { looseJsonParse } from '@/lib/llm/parse'

// ─── signal_type enum (content_signals와 동일) ────────────────────────────────

const VALID_SIGNAL_TYPES = new Set([
  '경쟁사동향', '규제', '정부', '신제품', '출시', '투자', 'M&A', '기술트렌드',
])

// ─── 공개 타입 ────────────────────────────────────────────────────────────────

export interface EntityEvent {
  event_date: string        // YYYY-MM-DD
  signal_type: string | null
  headline: string          // 사건 한 줄
  detail: string | null
  sentiment: '긍정' | '중립' | '부정' | null
  citations: string[]       // content_id (환각 가드 통과분)
}

// ─── 내부 타입 ────────────────────────────────────────────────────────────────

interface ContentInput {
  content_id: string
  title: string
  summary_ko: string | null
  published_at: string | null
  signal_type: string | null
  sentiment: string | null
}

// ─── 프롬프트 ─────────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `당신은 LG U+ B2B 시장 인텔리전스 분석가다.
아래 기사 목록을 근거로 이 기업의 굵직한 사건만 시간순으로 추려라.
잡다한 일상 기사·반복 언급은 제외하고, 기업 전략·시장 지위에 영향을 준 사건만 선별.

반드시 지켜야 할 규칙:
1. 추측 금지 — 제공된 사실만 기술.
2. 각 사건 근거 content_id를 citations 배열에 명시.
3. citations는 반드시 입력 목록에 존재하는 content_id만 사용.
4. event_date는 YYYY-MM-DD 형식.
5. signal_type은 다음 중 하나(해당 없으면 null): 경쟁사동향, 규제, 정부, 신제품, 출시, 투자, M&A, 기술트렌드.
6. JSON 배열만 출력. 최대 15개 사건.

출력 스키마 (배열):
[
  {
    "event_date": "YYYY-MM-DD",
    "signal_type": "신제품 또는 null",
    "headline": "사건 한 줄 제목",
    "detail": "1문장 설명(선택)",
    "sentiment": "긍정|중립|부정|null",
    "citations": ["content_id_1"]
  }
]`

function buildUserPrompt(entityName: string, contents: ContentInput[]): string {
  const lines = contents.map(c =>
    `[${c.content_id}] (${c.published_at?.slice(0, 10) ?? '날짜미상'}) ${c.title}` +
    (c.summary_ko ? `\n요약: ${c.summary_ko}` : '') +
    (c.sentiment ? ` (논조: ${c.sentiment})` : '') +
    (c.signal_type ? ` [신호: ${c.signal_type}]` : '')
  ).join('\n\n')

  return `기업: ${entityName}\n\n근거 기사 (최신순):\n${lines}`
}

// ─── 파싱·검증 ────────────────────────────────────────────────────────────────

function parseAndValidate(raw: string, validIdSet: Set<string>): EntityEvent[] {
  const parsed = looseJsonParse(raw)
  if (!Array.isArray(parsed)) {
    // 단일 객체로 왔을 때 events 키로 감싸진 경우
    if (parsed && typeof parsed === 'object' && Array.isArray((parsed as Record<string, unknown>).events)) {
      return parseAndValidate(JSON.stringify((parsed as Record<string, unknown>).events), validIdSet)
    }
    return []
  }

  const results: EntityEvent[] = []
  for (const item of parsed) {
    if (!item || typeof item !== 'object') continue
    const ev = item as Record<string, unknown>

    // event_date 파싱
    const rawDate = typeof ev.event_date === 'string' ? ev.event_date.trim() : ''
    if (!rawDate || !/^\d{4}-\d{2}-\d{2}$/.test(rawDate)) continue
    const parsedDate = new Date(rawDate)
    if (isNaN(parsedDate.getTime())) continue

    // headline 필수
    const headline = typeof ev.headline === 'string' ? ev.headline.trim() : ''
    if (!headline) continue

    // signal_type enum 가드
    const rawSignal = typeof ev.signal_type === 'string' ? ev.signal_type.trim() : null
    const signal_type = rawSignal && VALID_SIGNAL_TYPES.has(rawSignal) ? rawSignal : null

    // detail
    const detail = typeof ev.detail === 'string' && ev.detail.trim() ? ev.detail.trim() : null

    // sentiment
    const rawSentiment = typeof ev.sentiment === 'string' ? ev.sentiment.trim() : null
    const sentiment = (rawSentiment === '긍정' || rawSentiment === '중립' || rawSentiment === '부정')
      ? rawSentiment
      : null

    // citations 환각 가드: 입력 집합에 존재하는 id만
    const rawCitations = Array.isArray(ev.citations)
      ? (ev.citations as unknown[]).filter((c): c is string => typeof c === 'string')
      : []
    const citations = rawCitations.filter(id => validIdSet.has(id))

    results.push({ event_date: rawDate, signal_type, headline, detail, sentiment, citations })
  }

  return results
}

// ─── 메인 함수 ────────────────────────────────────────────────────────────────

export interface GenerateEntityEventsResult {
  events: EntityEvent[]
  /** events가 빈 배열일 때 그 이유(엔티티 없음/콘텐츠 부족/LLM 실패 등). 정상 케이스면 null */
  errorReason: string | null
}

export async function generateEntityEvents(
  admin: SupabaseClient,
  entityId: string,
  opts?: { days?: number },
): Promise<GenerateEntityEventsResult> {
  try {
    const days = opts?.days ?? 120
    const since = new Date(Date.now() - days * 86_400_000).toISOString()

    // 1. 엔티티 이름 조회
    const { data: entityData } = await admin
      .from('entities')
      .select('id, canonical_name')
      .eq('id', entityId)
      .single()
    if (!entityData) return { events: [], errorReason: '엔티티를 찾을 수 없음' }
    const entity = entityData as { id: string; canonical_name: string }

    // 2. content_entities → 콘텐츠 (최근 days일, 최대 80건)
    const { data: ceData } = await admin
      .from('content_entities')
      .select('content_id')
      .eq('entity_id', entityId)
      .limit(200)

    const allContentIds: string[] = (ceData ?? []).map((r: { content_id: string }) => r.content_id)
    if (allContentIds.length === 0) {
      return { events: [], errorReason: '연관된 콘텐츠 없음' }
    }

    const { data: contentsData } = await admin
      .from('contents')
      .select('id, title, summary_ko, published_at, sentiment')
      .in('id', allContentIds)
      .eq('status', 'published')
      .gte('published_at', since)
      .order('published_at', { ascending: false })
      .limit(80)

    const contentRows = (contentsData ?? []) as {
      id: string
      title: string
      summary_ko: string | null
      published_at: string | null
      sentiment: string | null
    }[]

    if (contentRows.length === 0) {
      return { events: [], errorReason: `최근 ${days}일 내 발행된 콘텐츠 없음` }
    }

    const contentIds = contentRows.map(r => r.id)
    const validIdSet = new Set(contentIds)

    // 3. content_signals — 대표 signal_type(score 최대) 맵
    const { data: signalData } = await admin
      .from('content_signals')
      .select('content_id, signal_type, score')
      .in('content_id', contentIds)

    const signalMap = new Map<string, string>()
    const signalRows = (signalData ?? []) as { content_id: string; signal_type: string; score: number }[]

    // 각 content_id별로 score 최대인 signal_type 선택
    const signalByContent = new Map<string, { signal_type: string; score: number }>()
    for (const row of signalRows) {
      const existing = signalByContent.get(row.content_id)
      if (!existing || row.score > existing.score) {
        signalByContent.set(row.content_id, { signal_type: row.signal_type, score: row.score })
      }
    }
    for (const [cid, best] of signalByContent.entries()) {
      signalMap.set(cid, best.signal_type)
    }

    // 4. 입력 조립
    const contents: ContentInput[] = contentRows.map(r => ({
      content_id: r.id,
      title: r.title,
      summary_ko: r.summary_ko,
      published_at: r.published_at,
      signal_type: signalMap.get(r.id) ?? null,
      sentiment: r.sentiment,
    }))

    // 5. LLM 호출
    const { text: raw, errorReason: llmErrorReason } = await llmCompleteDetailed(
      'report', SYSTEM_PROMPT, buildUserPrompt(entity.canonical_name, contents)
    )
    if (!raw) {
      return { events: [], errorReason: llmErrorReason ?? 'LLM 응답 없음' }
    }

    // 6. 파싱 + 환각 가드
    const events = parseAndValidate(raw, validIdSet)
    return {
      events,
      errorReason: events.length === 0 ? 'LLM 응답에서 유효한 사건을 추출하지 못함' : null,
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[generateEntityEvents] 오류:', message)
    return { events: [], errorReason: `내부 오류: ${message}` }
  }
}
