import { verifyAdminRequest } from '@/lib/admin/verify-admin-request'
import { NextRequest, NextResponse } from 'next/server'
import { classifyEntityEventsBizImpact, type BackfillEventInput } from '@/lib/entities/classify-biz-impact'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 280


interface EntityEventPending {
  id: string
  entity_id: string
  event_date: string
  headline: string
  detail: string | null
  signal_type: string | null
}

interface EntityPreview {
  entityId: string
  entityName: string
  events: {
    id: string
    headline: string
    biz_impact: 'crisis' | 'opportunity' | 'neutral' | null
    biz_impact_reason: string | null
  }[]
}

/**
 * POST /api/admin/entity-events/backfill-biz-impact?dryRun=1&limit=3
 * 지시서 A §1-4 백필 — biz_impact IS NULL 인 기존 entity_events 를 엔티티 단위로 배치 재판정.
 * dryRun=1 이면 DB에 쓰지 않고 판정 결과만 미리보기로 반환(§3 검증용 표본 확인).
 * limit 은 이번 호출에서 처리할 "엔티티 수"(엔티티당 LLM 1콜). 재호출 시 이미 채워진 행은 건너뛰어 재개 가능(멱등).
 */
export async function POST(request: NextRequest) {
  const gate = await verifyAdminRequest()
  if (!gate.ok) return gate.response

  const url = new URL(request.url)
  const dryRun = url.searchParams.get('dryRun') === '1'
  const limit = Math.min(Number(url.searchParams.get('limit') ?? (dryRun ? 3 : 20)) || (dryRun ? 3 : 20), 60)

  const admin = gate.admin
  const deadline = Date.now() + 250_000

  try {
    // biz_impact 미판정 사건이 있는 entity_id 목록(멱등 — 재호출 시 이미 채운 건 자동 제외)
    const { data: pendingEvents, error: pendingError } = await admin
      .from('entity_events')
      .select('id, entity_id, event_date, headline, detail, signal_type')
      .is('biz_impact', null)
      .order('entity_id', { ascending: true })
      // PostgREST max-rows. 이 이상 요청해도 서버가 조용히 자른다 — 넘길 일이 생기면 range() 페이지네이션이 필요하다
      .limit(1000)

    if (pendingError) {
      return NextResponse.json({ error: `조회 실패: ${pendingError.message}` }, { status: 500 })
    }

    const rows = (pendingEvents ?? []) as EntityEventPending[]
    if (rows.length === 0) {
      return NextResponse.json({ ok: true, done: true, message: '재판정 대상 없음(전량 완료)' })
    }

    const byEntity = new Map<string, EntityEventPending[]>()
    for (const row of rows) {
      const list = byEntity.get(row.entity_id) ?? []
      list.push(row)
      byEntity.set(row.entity_id, list)
    }

    const entityIds = [...byEntity.keys()].slice(0, limit)
    const { data: entities } = await admin
      .from('entities')
      .select('id, canonical_name')
      .in('id', entityIds)

    const nameMap = new Map<string, string>(
      ((entities ?? []) as { id: string; canonical_name: string }[]).map(e => [e.id, e.canonical_name])
    )

    const previews: EntityPreview[] = []
    let entitiesProcessed = 0
    let eventsUpdated = 0
    const errors: string[] = []

    for (const entityId of entityIds) {
      if (Date.now() >= deadline) break
      const entityEvents = byEntity.get(entityId) ?? []
      const entityName = nameMap.get(entityId) ?? '(알 수 없는 엔티티)'

      const input: BackfillEventInput[] = entityEvents.map(e => ({
        id: e.id,
        event_date: e.event_date,
        headline: e.headline,
        detail: e.detail,
        signal_type: e.signal_type,
      }))

      const { results, errorReason } = await classifyEntityEventsBizImpact(entityName, input)
      if (results.length === 0) {
        errors.push(`entity ${entityId}(${entityName}): ${errorReason ?? '판정 실패'}`)
        continue
      }
      entitiesProcessed++

      if (dryRun) {
        const byId = new Map(results.map(r => [r.id, r]))
        previews.push({
          entityId,
          entityName,
          events: entityEvents.map(e => {
            const r = byId.get(e.id)
            return {
              id: e.id,
              headline: e.headline,
              biz_impact: r?.biz_impact ?? null,
              biz_impact_reason: r?.biz_impact_reason ?? null,
            }
          }),
        })
        continue
      }

      for (const r of results) {
        const { error: updateError } = await admin
          .from('entity_events')
          .update({ biz_impact: r.biz_impact, biz_impact_reason: r.biz_impact_reason })
          .eq('id', r.id)
        if (updateError) {
          errors.push(`event ${r.id}: ${updateError.message}`)
        } else {
          eventsUpdated++
        }
      }
    }

    const remainingEntities = byEntity.size - entitiesProcessed
    return NextResponse.json({
      ok: true,
      dryRun,
      entitiesProcessed,
      eventsUpdated: dryRun ? undefined : eventsUpdated,
      remainingEntities: Math.max(0, remainingEntities),
      errors,
      preview: dryRun ? previews : undefined,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[backfill-biz-impact] 오류:', message)
    return NextResponse.json({ error: `서버 오류: ${message}` }, { status: 500 })
  }
}
