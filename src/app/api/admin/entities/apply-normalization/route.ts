import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { createAdminClient } from '@/lib/supabase/admin'
import type { NormalizationGroup } from '@/lib/entities/suggest-normalization'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

async function verifyAdmin() {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return { error: NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 }) }
  }

  const { data: profile } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!profile || profile.role !== 'admin') {
    return { error: NextResponse.json({ error: '관리자 권한이 필요합니다.' }, { status: 403 }) }
  }

  return { error: null }
}

/**
 * POST /api/admin/entities/apply-normalization
 * 제안된 그룹 1개를 실제로 적용: merge_entities(기존 RPC) + entity_aliases insert
 */
export async function POST(request: NextRequest) {
  const { error: authError } = await verifyAdmin()
  if (authError) return authError

  let group: NormalizationGroup
  try {
    group = await request.json() as NormalizationGroup
  } catch {
    return NextResponse.json({ error: '잘못된 요청 바디' }, { status: 400 })
  }

  if (!group.canonicalId || !Array.isArray(group.mergeIds) || group.mergeIds.length === 0) {
    return NextResponse.json({ error: 'canonicalId와 mergeIds가 필요합니다.' }, { status: 400 })
  }

  const admin = createAdminClient()
  const errors: string[] = []
  let mergedCount = 0

  // 1. 각 merge_id → canonical_id 로 merge_entities RPC 순차 실행
  for (const sourceId of group.mergeIds) {
    if (sourceId === group.canonicalId) continue  // 자기참조 안전망
    const { error: mergeErr } = await admin.rpc('merge_entities', {
      p_source: sourceId,
      p_target: group.canonicalId,
    })
    if (mergeErr) {
      errors.push(`merge ${sourceId}: ${mergeErr.message}`)
    } else {
      mergedCount++
    }
  }

  // 2. new_aliases insert (멱등 — unique 충돌 무시)
  let aliasCount = 0
  if (group.newAliases && group.newAliases.length > 0) {
    const aliasRows = group.newAliases.map(alias => ({
      entity_id: group.canonicalId,
      alias,
    }))
    const { error: aliasErr } = await admin
      .from('entity_aliases')
      .upsert(aliasRows, { onConflict: 'alias', ignoreDuplicates: true })
    if (aliasErr && aliasErr.code !== '23505') {
      errors.push(`alias insert: ${aliasErr.message}`)
    } else {
      aliasCount = group.newAliases.length
    }
  }

  if (errors.length > 0 && mergedCount === 0) {
    return NextResponse.json({ error: errors.join('; ') }, { status: 500 })
  }

  return NextResponse.json({
    mergedCount,
    aliasCount,
    errors: errors.length > 0 ? errors : undefined,
  })
}
