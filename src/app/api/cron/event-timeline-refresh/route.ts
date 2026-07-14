import type { NextRequest } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import { LLM_PROVIDERS } from '@/lib/llm'
import { generateEntityEvents } from '@/lib/entities/generate-events'
import { runJob } from '@/lib/jobs/run-job'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 280

const DRAIN_LIMIT = 15

interface EventTimelineRefreshResult {
  ok: boolean
  timelines: number
  errors: string[]
}

/** 사건 타임라인 3일 주기 자동 갱신 (지시서 C). stalest(generated_at 오래된 순) 먼저. */
async function runEventTimelineRefresh(admin: SupabaseClient): Promise<EventTimelineRefreshResult> {
  const deadline = Date.now() + 250_000
  const result: EventTimelineRefreshResult = { ok: true, timelines: 0, errors: [] }

  try {
    // 대상 엔티티: 경쟁사 + mention 상위
    const { data: entities } = await admin
      .from('entities')
      .select('id, canonical_name, is_competitor, mention_count')
      .or('is_competitor.eq.true,mention_count.gte.3')
      .order('mention_count', { ascending: false })
      .limit(60)

    const targetEntities = (entities ?? []) as { id: string; canonical_name: string; is_competitor: boolean; mention_count: number }[]
    if (targetEntities.length === 0) return result

    const targetIds = targetEntities.map(e => e.id)

    // 엔티티별 최신 generated_at 조회 (entity_events에 MAX generated_at)
    const { data: eventRows } = await admin
      .from('entity_events')
      .select('entity_id, generated_at')
      .in('entity_id', targetIds)
      .order('generated_at', { ascending: false })

    const genAtMap = new Map<string, string>()
    for (const row of (eventRows ?? []) as { entity_id: string; generated_at: string }[]) {
      if (!genAtMap.has(row.entity_id)) genAtMap.set(row.entity_id, row.generated_at)
    }

    // 최근 3일 이내 갱신된 엔티티는 이번 회차에서 제외
    const staleCutoff = new Date(Date.now() - 3 * 86_400_000).toISOString()

    // stalest(null 먼저) → 오래된 generated_at 순 정렬
    const sorted = [...targetEntities]
      .filter(e => {
        const genAt = genAtMap.get(e.id) ?? null
        return genAt === null || genAt < staleCutoff
      })
      .sort((a, b) => {
        const aDate = genAtMap.get(a.id) ?? null
        const bDate = genAtMap.get(b.id) ?? null
        if (aDate === null && bDate === null) return 0
        if (aDate === null) return -1
        if (bDate === null) return 1
        return aDate < bDate ? -1 : 1
      })

    for (const entity of sorted.slice(0, DRAIN_LIMIT)) {
      if (Date.now() >= deadline) break
      try {
        // generateEntityEvents 내부 llmCompleteDetailed가 completeWithRetry로 503 등 일시 실패 재시도(2회, backoff) 처리
        const { events } = await generateEntityEvents(admin, entity.id)
        if (events.length > 0) {
          await admin.from('entity_events').delete().eq('entity_id', entity.id)
          await admin.from('entity_events').insert(
            events.map(ev => ({
              entity_id: entity.id,
              event_date: ev.event_date,
              signal_type: ev.signal_type,
              headline: ev.headline,
              detail: ev.detail,
              sentiment: ev.sentiment,
              source_content_ids: ev.citations,
              citations: JSON.stringify(ev.citations),
              model: 'report',
            }))
          )
          result.timelines++
        }
      } catch (err) {
        result.errors.push(`timeline ${entity.id}: ${err instanceof Error ? err.message : String(err)}`)
      }
    }
  } catch (err) {
    result.errors.push(`timelines: ${err instanceof Error ? err.message : String(err)}`)
  }

  console.log('[event-timeline-refresh] 완료:', JSON.stringify(result))
  return result
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return Response.json({ ok: false, error: '인증 실패' }, { status: 401 })
  }

  const admin = createAdminClient()
  const result = await runJob(admin, { key: 'cron:event-timeline-refresh', trigger: 'cron' }, async () => {
    if (!LLM_PROVIDERS.some(p => p.isConfigured())) {
      return { ok: true, skipped: true, reason: 'LLM 키 없음' }
    }
    return runEventTimelineRefresh(admin)
  })
  return Response.json(result)
}
