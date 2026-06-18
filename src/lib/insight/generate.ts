import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import { llmComplete } from '@/lib/llm'
import type { SupabaseClient } from '@supabase/supabase-js'

// ─── 타입 ─────────────────────────────────────────────────────────────────────

interface ContentRow {
  id: string
  title: string
  summary_ko: string | null
  matched_groups: string[] | null
  importance_score: number | null
  cluster_id: string | null
  collected_at: string
}

interface LlmOutput {
  headline: string
  implication: string
  citations: { content_id: string; quote: string }[]
}

interface GenerateOptions {
  days?: number
  maxThemes?: number
}

// ─── KST 날짜 유틸 ────────────────────────────────────────────────────────────

function kstDateString(offsetDays = 0): string {
  const now = Date.now()
  const kst = new Date(now + 9 * 60 * 60 * 1000)
  const shifted = new Date(kst.getTime() - offsetDays * 24 * 60 * 60 * 1000)
  const y = shifted.getUTCFullYear()
  const m = String(shifted.getUTCMonth() + 1).padStart(2, '0')
  const d = String(shifted.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/** KST 날짜(YYYY-MM-DD) → UTC 00:00 ISO 문자열 */
function kstDateToUtcIso(dateStr: string): string {
  return new Date(`${dateStr}T00:00:00+09:00`).toISOString()
}

// ─── LLM 프롬프트 ────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `당신은 LG U+ B2B 시장 인텔리전스 분석가다.
주어진 기사들로 이 주제의 핵심 동향 1줄(headline)과 LG U+ B2B(엔터프라이즈/공공/AICC·AIDC 등)에의 시사점 1~2줄(implication)을 쓰라.
근거 없는 주장 금지 — 각 핵심 주장은 입력 기사에서 15단어 이내 인용과 그 content_id를 citations로 제시.
JSON만 출력: {"headline":"","implication":"","citations":[{"content_id":"","quote":""}]}`

function buildUserPrompt(topic: string, articles: ContentRow[]): string {
  const lines = articles
    .map((a) => `[${a.id}] ${a.title}\n${a.summary_ko ?? ''}`)
    .join('\n\n')
  return `주제: ${topic}\n\n${lines}`
}

// ─── LLM 출력 파싱 ────────────────────────────────────────────────────────────

function parseLlmOutput(raw: string): LlmOutput | null {
  try {
    const cleaned = raw
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim()
    const parsed = JSON.parse(cleaned) as unknown
    if (typeof parsed !== 'object' || parsed === null) return null
    const obj = parsed as Record<string, unknown>
    if (typeof obj.headline !== 'string' || !obj.headline) return null
    const citations = Array.isArray(obj.citations)
      ? (obj.citations as unknown[])
          .filter(
            (c): c is { content_id: string; quote: string } =>
              typeof c === 'object' &&
              c !== null &&
              typeof (c as Record<string, unknown>).content_id === 'string' &&
              typeof (c as Record<string, unknown>).quote === 'string'
          )
      : []
    return {
      headline: obj.headline as string,
      implication: typeof obj.implication === 'string' ? obj.implication : '',
      citations,
    }
  } catch {
    return null
  }
}

// ─── 메인 엔진 ────────────────────────────────────────────────────────────────

export async function generateIndustryInsightCards(
  adminClient: SupabaseClient,
  opts: GenerateOptions = {}
): Promise<{ created: number; topics: string[] }> {
  const days = Math.max(1, opts.days ?? 7)
  const maxThemes = Math.max(1, Math.min(opts.maxThemes ?? 5, 10))

  const periodEnd = kstDateString(0)
  const periodStart = kstDateString(days - 1)
  const sinceIso = kstDateToUtcIso(periodStart)

  // 1. 후보 수집
  const { data: rawContents, error: contentsError } = await adminClient
    .from('contents')
    .select('id, title, summary_ko, matched_groups, importance_score, cluster_id, collected_at')
    .eq('status', 'published')
    .gte('collected_at', sinceIso)
    .not('matched_groups', 'is', null)
    .limit(400)

  if (contentsError) {
    console.error('[InsightGen] 콘텐츠 조회 실패:', contentsError.message)
    return { created: 0, topics: [] }
  }

  const contents = (rawContents ?? []) as ContentRow[]
  const validContents = contents.filter(
    (c) => c.matched_groups && c.matched_groups.length > 0
  )

  if (validContents.length === 0) {
    console.log('[InsightGen] 태깅된 콘텐츠 없음 — 생성 건너뜀')
    return { created: 0, topics: [] }
  }

  // 2. 테마 그룹핑 — matched_groups 빈도 집계
  const groupFreq = new Map<string, ContentRow[]>()
  for (const c of validContents) {
    for (const g of c.matched_groups ?? []) {
      if (!groupFreq.has(g)) groupFreq.set(g, [])
      groupFreq.get(g)!.push(c)
    }
  }

  const topGroups = [...groupFreq.entries()]
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, maxThemes)

  const contentIdSet = new Set(validContents.map((c) => c.id))
  const created: string[] = []

  for (const [group, groupArticles] of topGroups) {
    try {
      // 클러스터 대표 우선(cluster_id null) + importance desc, 상위 8건
      const sorted = [...groupArticles].sort((a, b) => {
        const aIsRep = a.cluster_id === null ? 0 : 1
        const bIsRep = b.cluster_id === null ? 0 : 1
        if (aIsRep !== bIsRep) return aIsRep - bIsRep
        return (b.importance_score ?? 0) - (a.importance_score ?? 0)
      })
      const articles = sorted.slice(0, 8)

      // 3. LLM 생성
      const raw = await llmComplete(
        'report',
        SYSTEM_PROMPT,
        buildUserPrompt(group, articles)
      )

      if (!raw) {
        console.warn(`[InsightGen] topic="${group}" LLM 응답 없음 — 건너뜀`)
        continue
      }

      const parsed = parseLlmOutput(raw)
      if (!parsed) {
        console.warn(`[InsightGen] topic="${group}" LLM 파싱 실패 — 건너뜀`)
        continue
      }

      // 4. citation content_id 검증 (환각 차단)
      const validCitations = parsed.citations.filter((c) =>
        contentIdSet.has(c.content_id)
      )

      const sourceIds = articles.map((a) => a.id)

      // 5. 멱등 upsert
      const { error: upsertError } = await adminClient
        .from('insight_cards')
        .upsert(
          {
            period_start: periodStart,
            period_end: periodEnd,
            scope: 'industry',
            topic: group,
            headline: parsed.headline,
            implication: parsed.implication || null,
            source_content_ids: sourceIds,
            citations: validCitations,
            status: 'draft',
            generated_at: new Date().toISOString(),
          },
          { onConflict: 'period_start,scope,topic' }
        )

      if (upsertError) {
        console.error(`[InsightGen] topic="${group}" upsert 실패:`, upsertError.message)
      } else {
        created.push(group)
        console.log(`[InsightGen] topic="${group}" 생성 완료 (citations=${validCitations.length})`)
      }
    } catch (err) {
      console.error(
        `[InsightGen] topic="${group}" 처리 오류:`,
        err instanceof Error ? err.message : String(err)
      )
    }
  }

  return { created: created.length, topics: created }
}
