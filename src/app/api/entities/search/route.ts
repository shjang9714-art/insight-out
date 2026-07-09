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

  if (q.length < 1) {
    return NextResponse.json({ entities: [] })
  }

  const [{ data: nameMatches, error: nameErr }, { data: aliasMatches, error: aliasErr }] = await Promise.all([
    supabase
      .from('entities')
      .select('id, canonical_name')
      .eq('entity_type', type)
      .ilike('canonical_name', `%${q}%`)
      .limit(10),
    supabase
      .from('entity_aliases')
      .select('alias, entities!inner(id, canonical_name, entity_type)')
      .ilike('alias', `%${q}%`)
      .eq('entities.entity_type', type)
      .limit(10),
  ])

  if (nameErr || aliasErr) {
    console.error('[entities/search] 조회 오류:', nameErr ?? aliasErr)
    return NextResponse.json({ error: '기업 검색에 실패했습니다.' }, { status: 500 })
  }

  const byId = new Map<string, EntityRow>()
  for (const e of (nameMatches ?? []) as EntityRow[]) byId.set(e.id, e)
  for (const a of (aliasMatches ?? []) as unknown as AliasRow[]) {
    if (a.entities) byId.set(a.entities.id, a.entities)
  }

  const entities = [...byId.values()].slice(0, 10)
  return NextResponse.json({ entities })
}
