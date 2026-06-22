import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { llmComplete } from '@/lib/llm'
import { looseJsonParse } from '@/lib/llm/parse'

// DB enum (65-content-signals.sql)
export const SIGNAL_TYPES = [
  '경쟁사동향',
  '규제·정부',
  '신제품·출시',
  '투자·M&A',
  '기술트렌드',
  '시장지표',
  '파트너십',
  '인사·조직',
] as const

export type SignalType = typeof SIGNAL_TYPES[number]

const SIGNAL_SET = new Set<string>(SIGNAL_TYPES)

const SYSTEM_PROMPT =
  'B2B 텔레콤/엔터프라이즈 시장 큐레이터. 이 기사에 해당하는 **사건/신호 유형**을 아래 목록에서 0개 이상 골라라(다중). ' +
  '특히 이벤트형(신제품·출시 / 투자·M&A / 시장지표 / 파트너십 / 인사·조직) 판정에 집중. ' +
  '해당 없으면 빈 배열. **JSON만**: {"signals":[{"type":"...","score":0~1}]}. 설명·머리말 금지.\n\n' +
  '신호 유형: 경쟁사동향, 규제·정부, 신제품·출시, 투자·M&A, 기술트렌드, 시장지표, 파트너십, 인사·조직'

/**
 * LLM으로 기사의 신호 유형을 분류한다.
 * 파싱 실패·키 없음·한도 등 어떤 오류도 null 반환 (절대 throw 안 함).
 */
export async function classifyContentSignals(
  title: string,
  snippet: string,
): Promise<{ signal_type: SignalType; score: number }[] | null> {
  try {
    const user = `제목: ${title}\n발췌: ${snippet.slice(0, 300)}`
    const out = await llmComplete('classify', SYSTEM_PROMPT, user)
    if (!out) return null

    const parsed = looseJsonParse(out)
    if (parsed === null || typeof parsed !== 'object') {
      console.warn('[classify-signals] parse fail:', out.slice(0, 200))
      return null
    }

    const obj = parsed as Record<string, unknown>
    const rawSignals = Array.isArray(obj.signals) ? obj.signals : []

    const seen = new Set<string>()
    const results: { signal_type: SignalType; score: number }[] = []

    for (const item of rawSignals as unknown[]) {
      if (typeof item !== 'object' || item === null) continue
      const entry = item as Record<string, unknown>
      const type = entry.type
      if (typeof type !== 'string' || !SIGNAL_SET.has(type)) continue
      if (seen.has(type)) continue
      seen.add(type)

      const rawScore = entry.score
      const score = typeof rawScore === 'number'
        ? Math.min(1, Math.max(0, rawScore))
        : 0.7

      results.push({ signal_type: type as SignalType, score })
    }

    return results
  } catch (e) {
    console.error('[신호분류] 오류:', e)
    return null
  }
}

interface DrainSignalsOptions {
  limit?: number
  /** Date.now() 값. 설정 시 deadline 초과까지 반복, 미설정 시 단일 배치. */
  deadline?: number
}

interface DrainSignalsResult {
  processed: number
  tagged: number
  /** -1: signals_classified_at 컬럼 미적용 */
  remaining: number
}

interface ContentRow {
  id: string
  title: string
  summary_ko: string | null
}

async function pendingSignalsCount(admin: SupabaseClient): Promise<number> {
  const { count } = await admin
    .from('contents')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'published')
    .is('signals_classified_at', null)
  return count ?? 0
}

/**
 * signals_classified_at IS NULL 인 published 콘텐츠를 신호 분류한다.
 * deadline 미설정: 단일 배치(limit 건) 처리 후 반환.
 * deadline 설정: deadline 초과 또는 remaining=0 까지 반복.
 */
export async function drainSignals(
  admin: SupabaseClient,
  opts: DrainSignalsOptions = {},
): Promise<DrainSignalsResult> {
  const { limit = 10, deadline } = opts
  let processed = 0
  let tagged = 0
  let remaining = 0

  while (true) {
    if (deadline !== undefined && Date.now() >= deadline) break

    const { data: targets, error: fetchErr } = await admin
      .from('contents')
      .select('id, title, summary_ko')
      .eq('status', 'published')
      .is('signals_classified_at', null)
      .order('collected_at', { ascending: false })
      .limit(limit)

    if (fetchErr) {
      // 컬럼 미존재 (SQL 핸드오프 미실행)
      if ((fetchErr as { code?: string }).code === '42703') {
        return { processed, tagged, remaining: -1 }
      }
      console.error('[드레인-신호] 조회 오류:', fetchErr)
      break
    }

    if (!targets?.length) {
      remaining = await pendingSignalsCount(admin)
      break
    }

    for (const row of targets as ContentRow[]) {
      try {
        const signals = await classifyContentSignals(row.title, row.summary_ko ?? '')

        if (signals && signals.length > 0) {
          const rows = signals.map((s) => ({
            content_id: row.id,
            signal_type: s.signal_type,
            score: s.score,
            source: 'llm',
          }))
          const { error: upsertErr } = await admin
            .from('content_signals')
            .upsert(rows, { onConflict: 'content_id,signal_type', ignoreDuplicates: true })
          if (upsertErr) {
            console.error('[드레인-신호] upsert 오류 (id:', row.id, '):', upsertErr)
          } else {
            tagged += signals.length
          }
        }

        // 신호 0개여도 signals_classified_at 마킹 (재드레인 방지)
        await admin
          .from('contents')
          .update({ signals_classified_at: new Date().toISOString() })
          .eq('id', row.id)

        processed++
      } catch (e) {
        console.error('[드레인-신호] 행 처리 오류 (id:', row.id, '):', e)
      }
    }

    remaining = await pendingSignalsCount(admin)
    if (remaining === 0) break
    if (deadline === undefined) break
  }

  return { processed, tagged, remaining }
}
