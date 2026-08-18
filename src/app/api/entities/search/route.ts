import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

interface EntityRow {
  id: string
  canonical_name: string
}

interface AliasRow {
  alias: string
  entities: EntityRow | null
}

/**
 * GET /api/entities/search?q=&type=company
 * 회사 엔티티 마스터 검색(canonical_name·별칭 ilike) — 관심기업 자동완성(225)용.
 */
export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const q = (searchParams.get('q') ?? '').trim()
  const type = searchParams.get('type') ?? 'company'
  const excludeId = searchParams.get('excludeId')

  if (q.length < 1) {
    return NextResponse.json({ entities: [] })
  }

  let nameQuery = supabase
    .from('entities')
    .select('id, canonical_name')
    .ilike('canonical_name', `%${q}%`)
    .limit(10)
  let aliasQuery = supabase
    .from('entity_aliases')
    .select('alias, entities!inner(id, canonical_name, entity_type)')
    .ilike('alias', `%${q}%`)
    .limit(10)
  // type=all — 계층(상위 엔티티) 선택 등 엔티티 종류 무관 검색(521)
  if (type !== 'all') {
    nameQuery = nameQuery.eq('entity_type', type)
    aliasQuery = aliasQuery.eq('entities.entity_type', type)
  }
  if (excludeId) {
    nameQuery = nameQuery.neq('id', excludeId)
  }

  const [{ data: nameMatches, error: nameErr }, { data: aliasMatches, error: aliasErr }] = await Promise.all([
    nameQuery,
    aliasQuery,
  ])

  if (nameErr || aliasErr) {
    console.error('[entities/search] 조회 오류:', nameErr ?? aliasErr)
    return NextResponse.json({ error: '기업 검색에 실패했습니다.' }, { status: 500 })
  }

  const byId = new Map<string, EntityRow>()
  for (const e of (nameMatches ?? []) as EntityRow[]) byId.set(e.id, e)
  for (const a of (aliasMatches ?? []) as unknown as AliasRow[]) {
    if (a.entities && a.entities.id !== excludeId) byId.set(a.entities.id, a.entities)
  }

  const entities = [...byId.values()].slice(0, 10)
  return NextResponse.json({ entities })
}
