import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { llmComplete } from '@/lib/llm'
import { looseJsonParse } from '@/lib/llm/parse'

// ─── 공개 타입 ────────────────────────────────────────────────────────────────

export interface NormalizationGroup {
  canonicalId: string
  canonicalName: string
  mergeIds: string[]
  newAliases: string[]
  reason: string
  confidence: number
}

// ─── 내부 타입 ────────────────────────────────────────────────────────────────

interface EntityInput {
  id: string
  canonical_name: string
  entity_type: string
  aliases: string[]
}

// ─── 프롬프트 ─────────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `당신은 엔티티 정규화 전문가다.
아래 엔티티 목록에서 같은 실체의 다른 표기(영문/국문/약칭, 예: MS=Microsoft=마이크로소프트)를 묶어라.

반드시 지켜야 할 규칙:
1. 확실한 것만 — 추측 금지. 애매하면 제외.
2. 서로 다른 회사·기술·인물을 합치지 말 것. (예: SKT ≠ KT)
3. 각 그룹: 목록 내 대표 1개(mention이 많거나 표준 표기) + 병합할 나머지 id + 추가 동의어(약칭·표기 변형).
4. confidence: 0~1 (0.9+ = 거의 확실, 0.6~0.9 = 높은 확신, 0.6 미만은 포함하지 말 것).
5. JSON만 출력.

출력 스키마:
{"groups":[{"canonical_id":"","merge_ids":[],"new_aliases":[],"reason":"왜 같은 실체인지 한 줄","confidence":0.9}]}`

function buildUserPrompt(entities: EntityInput[]): string {
  const lines = entities.map(e =>
    `id=${e.id} | ${e.canonical_name}` + (e.aliases.length > 0 ? ` (동의어: ${e.aliases.join(', ')})` : '')
  ).join('\n')
  return `엔티티 목록 (${entities.length}개):\n${lines}`
}

// ─── 파싱·환각 가드 ───────────────────────────────────────────────────────────

function parseAndValidate(
  raw: string,
  inputMap: Map<string, EntityInput>,
  entityType: string,
): NormalizationGroup[] {
  const parsed = looseJsonParse(raw)
  if (!parsed || typeof parsed !== 'object') return []

  const groups = (parsed as Record<string, unknown>).groups
  if (!Array.isArray(groups)) return []

  const results: NormalizationGroup[] = []

  for (const item of groups) {
    if (!item || typeof item !== 'object') continue
    const g = item as Record<string, unknown>

    const canonicalId = typeof g.canonical_id === 'string' ? g.canonical_id.trim() : ''
    if (!canonicalId) continue

    // 입력 집합 가드: canonical_id가 목록에 존재해야 함
    const canonicalEnt = inputMap.get(canonicalId)
    if (!canonicalEnt) continue

    // 동일 타입 가드
    if (canonicalEnt.entity_type !== entityType) continue

    // merge_ids 검증
    const rawMergeIds = Array.isArray(g.merge_ids)
      ? (g.merge_ids as unknown[]).filter((x): x is string => typeof x === 'string')
      : []
    const mergeIds = rawMergeIds.filter(id => {
      if (id === canonicalId) return false  // 자기참조 제거
      const ent = inputMap.get(id)
      if (!ent) return false  // 입력 밖 id 제거
      if (ent.entity_type !== entityType) return false  // 교차 타입 제거
      return true
    })

    if (mergeIds.length === 0) continue  // 빈 그룹 제거

    // confidence 가드
    const confidence = typeof g.confidence === 'number' ? g.confidence : 0
    if (confidence < 0.6) continue

    const reason = typeof g.reason === 'string' ? g.reason.trim() : ''
    const newAliases = Array.isArray(g.new_aliases)
      ? (g.new_aliases as unknown[]).filter((x): x is string => typeof x === 'string' && x.trim().length > 0).map(x => x.trim())
      : []

    results.push({
      canonicalId,
      canonicalName: canonicalEnt.canonical_name,
      mergeIds,
      newAliases,
      reason,
      confidence,
    })
  }

  return results
}

// ─── 메인 함수 ────────────────────────────────────────────────────────────────

export async function suggestEntityNormalization(
  admin: SupabaseClient,
  opts?: { entityType?: string; limit?: number },
): Promise<NormalizationGroup[]> {
  try {
    const limit = opts?.limit ?? 150
    const entityType = opts?.entityType

    // 1. 엔티티 조회
    let query = admin
      .from('entities')
      .select('id, canonical_name, entity_type, mention_count')
      .order('mention_count', { ascending: false })
      .limit(limit)

    if (entityType) {
      query = query.eq('entity_type', entityType)
    }

    const { data: entityData, error: entityError } = await query
    if (entityError || !entityData || entityData.length === 0) return []

    const entityRows = entityData as { id: string; canonical_name: string; entity_type: string; mention_count: number }[]

    // 2. 동의어 조회
    const entityIds = entityRows.map(e => e.id)
    const { data: aliasData } = await admin
      .from('entity_aliases')
      .select('entity_id, alias')
      .in('entity_id', entityIds)

    const aliasMap = new Map<string, string[]>()
    for (const row of (aliasData ?? []) as { entity_id: string; alias: string }[]) {
      const list = aliasMap.get(row.entity_id) ?? []
      if (row.alias !== entityRows.find(e => e.id === row.entity_id)?.canonical_name) {
        list.push(row.alias)
      }
      aliasMap.set(row.entity_id, list)
    }

    // 3. entity_type 단위로 처리
    const typeGroups = new Map<string, EntityInput[]>()
    for (const e of entityRows) {
      const list = typeGroups.get(e.entity_type) ?? []
      list.push({
        id: e.id,
        canonical_name: e.canonical_name,
        entity_type: e.entity_type,
        aliases: aliasMap.get(e.id) ?? [],
      })
      typeGroups.set(e.entity_type, list)
    }

    const targetTypes = entityType ? [entityType] : [...typeGroups.keys()]
    const allGroups: NormalizationGroup[] = []

    for (const type of targetTypes) {
      const typeEntities = typeGroups.get(type)
      if (!typeEntities || typeEntities.length < 2) continue

      const inputMap = new Map(typeEntities.map(e => [e.id, e]))

      // 4. LLM 호출
      const raw = await llmComplete('report', SYSTEM_PROMPT, buildUserPrompt(typeEntities))
      if (!raw) continue

      // 5. 파싱 + 환각 가드
      const groups = parseAndValidate(raw, inputMap, type)
      allGroups.push(...groups)
    }

    return allGroups
  } catch (err) {
    console.error('[suggestEntityNormalization] 오류:', err instanceof Error ? err.message : String(err))
    return []
  }
}
