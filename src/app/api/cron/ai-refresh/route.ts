import type { NextRequest } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import { LLM_PROVIDERS } from '@/lib/llm'
import { generateIndustryInsightCards, generateCompanyInsightCards } from '@/lib/insight/generate'
import { generateIssueCandidates } from '@/lib/issues/generate-candidates'
import { generateEntityEvents } from '@/lib/entities/generate-events'
import { generateIssueBrief } from '@/lib/issues/brief'
import { backfillSentiment } from '@/lib/insight/sentiment-backfill'
import { issueAutoPublish } from '@/lib/insight/auto-publish'
import { runJob } from '@/lib/jobs/run-job'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

const DRAIN_LIMIT = 15

interface AiRefreshFullResult {
  ok: boolean
  insights: number
  companyInsights: number
  candidates: number
  timelines: number
  briefs: number
  sentiments: number
  errors: string[]
}

/** 기존 GET 로직 그대로 — Response.json() 래핑만 바깥(GET)으로 옮김(289, runJob 계측용). */
async function runAiRefresh(admin: SupabaseClient): Promise<AiRefreshFullResult> {
  const deadline = Date.now() + 270_000

  const result: AiRefreshFullResult = {
    ok: true,
    insights: 0,
    companyInsights: 0,
    candidates: 0,
    timelines: 0,
    briefs: 0,
    sentiments: 0,
    errors: [],
  }

  // ── ① 인사이트 카드 생성 ──────────────────────────────────────────────────
  try {
    const { created } = await generateIndustryInsightCards(admin)
    result.insights = created
  } catch (err) {
    result.errors.push(`insights: ${err instanceof Error ? err.message : String(err)}`)
  }

  if (Date.now() >= deadline) {
    console.log('[ai-refresh] 데드라인 초과 — insights 이후 중단')
    return result
  }

  // ── ①b 주요 기업 카드 생성(254 — curated 41개사, deadline 분할) ───────────
  try {
    const { created } = await generateCompanyInsightCards(admin, { deadline })
    result.companyInsights = created
  } catch (err) {
    result.errors.push(`companyInsights: ${err instanceof Error ? err.message : String(err)}`)
  }

  if (Date.now() >= deadline) {
    console.log('[ai-refresh] 데드라인 초과 — companyInsights 이후 중단')
    return result
  }

  // ── ② 이슈 후보 생성 + draft insert ─────────────────────────────────────
  try {
    const { candidates } = await generateIssueCandidates(admin)
    let inserted = 0

    for (const candidate of candidates) {
      if (Date.now() >= deadline) break
      try {
        const { data: issueRow, error: insertError } = await admin
          .from('issues')
          .insert({
            title: candidate.title,
            summary: candidate.summary,
            status: issueAutoPublish(candidate.content_ids.length) ? 'published' : 'draft',
            match_keywords: candidate.match_keywords,
            source: 'claude',
          })
          .select('id')
          .single()

        if (insertError || !issueRow) continue

        const issueId = (issueRow as { id: string }).id
        if (candidate.content_ids.length > 0) {
          await admin.from('issue_contents').insert(
            candidate.content_ids.map(contentId => ({
              issue_id: issueId,
              content_id: contentId,
              source: 'claude',
            }))
          )
        }
        inserted++
      } catch (err) {
        result.errors.push(`candidate insert: ${err instanceof Error ? err.message : String(err)}`)
      }
    }

    result.candidates = inserted
  } catch (err) {
    result.errors.push(`candidates: ${err instanceof Error ? err.message : String(err)}`)
  }

  if (Date.now() >= deadline) {
    console.log('[ai-refresh] 데드라인 초과 — candidates 이후 중단')
    return result
  }

  // ── ③ 사건 타임라인 드레인 (stalest 먼저) ──────────────────────────────
  try {
    // 대상 엔티티: 경쟁사 + mention 상위
    const { data: entities } = await admin
      .from('entities')
      .select('id, canonical_name, is_competitor, mention_count')
      .or('is_competitor.eq.true,mention_count.gte.3')
      .order('mention_count', { ascending: false })
      .limit(60)

    const targetEntities = (entities ?? []) as { id: string; canonical_name: string; is_competitor: boolean; mention_count: number }[]

    if (targetEntities.length > 0) {
      const targetIds = targetEntities.map(e => e.id)

      // 엔티티별 최신 generated_at 조회 (entity_events에 MAX generated_at)
      const { data: eventRows } = await admin
        .from('entity_events')
        .select('entity_id, generated_at')
        .in('entity_id', targetIds)
        .order('generated_at', { ascending: false })

      // entity_id → max generated_at 맵
      const genAtMap = new Map<string, string>()
      for (const row of (eventRows ?? []) as { entity_id: string; generated_at: string }[]) {
        if (!genAtMap.has(row.entity_id)) genAtMap.set(row.entity_id, row.generated_at)
      }

      // stalest(null 먼저) → 오래된 generated_at 순 정렬
      const sorted = [...targetEntities].sort((a, b) => {
        const aDate = genAtMap.get(a.id) ?? null
        const bDate = genAtMap.get(b.id) ?? null
        if (aDate === null && bDate === null) return 0
        if (aDate === null) return -1
        if (bDate === null) return 1
        return aDate < bDate ? -1 : 1
      })

      let timelineCount = 0
      for (const entity of sorted.slice(0, DRAIN_LIMIT)) {
        if (Date.now() >= deadline) break
        try {
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
            timelineCount++
          }
        } catch (err) {
          result.errors.push(`timeline ${entity.id}: ${err instanceof Error ? err.message : String(err)}`)
        }
      }
      result.timelines = timelineCount
    }
  } catch (err) {
    result.errors.push(`timelines: ${err instanceof Error ? err.message : String(err)}`)
  }

  if (Date.now() >= deadline) {
    console.log('[ai-refresh] 데드라인 초과 — timelines 이후 중단')
    return result
  }

  // ── ④ 이슈 브리핑 드레인 (brief_generated_at ASC NULLS FIRST) ────────────
  try {
    const { data: issues } = await admin
      .from('issues')
      .select('id, title, brief_generated_at')
      .eq('status', 'published')
      .order('brief_generated_at', { ascending: true, nullsFirst: true })
      .limit(DRAIN_LIMIT)

    let briefCount = 0
    for (const issue of (issues ?? []) as { id: string; title: string; brief_generated_at: string | null }[]) {
      if (Date.now() >= deadline) break
      try {
        const result2 = await generateIssueBrief(admin, issue.id)
        if (result2) {
          const { brief, model } = result2
          await admin.from('issues').update({
            brief,
            brief_generated_at: new Date().toISOString(),
            brief_model: model,
          }).eq('id', issue.id)
          briefCount++
        }
      } catch (err) {
        result.errors.push(`brief ${issue.id}: ${err instanceof Error ? err.message : String(err)}`)
      }
    }
    result.briefs = briefCount
  } catch (err) {
    result.errors.push(`briefs: ${err instanceof Error ? err.message : String(err)}`)
  }

  // ── ⑤ 논조 백필 (추적 엔티티 기사, deadline 인지) ──────────────────────────
  try {
    const { analyzed } = await backfillSentiment(admin, { deadline })
    result.sentiments = analyzed
  } catch (err) {
    result.errors.push(`sentiments: ${err instanceof Error ? err.message : String(err)}`)
  }

  console.log('[ai-refresh] 완료:', JSON.stringify(result))
  return result
}

export async function GET(request: NextRequest) {
  // CRON_SECRET 인증
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return Response.json({ ok: false, error: '인증 실패' }, { status: 401 })
  }

  const admin = createAdminClient()
  const result = await runJob(admin, { key: 'cron:ai-refresh', trigger: 'cron' }, async () => {
    // LLM 키 없으면 전체 skip
    if (!LLM_PROVIDERS.some(p => p.isConfigured())) {
      return { ok: true, skipped: true, reason: 'LLM 키 없음' }
    }
    return runAiRefresh(admin)
  })
  return Response.json(result)
}
