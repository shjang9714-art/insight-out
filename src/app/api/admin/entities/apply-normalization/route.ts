import { after, NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import type { NormalizationGroup } from '@/lib/entities/suggest-normalization'
import { createMergeJob, getMergeJob, updateMergeJob } from '@/lib/admin/merge-progress'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

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
    return { supabase: null, accessToken: null, error: NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 }) }
  }

  const { data: profile } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!profile || profile.role !== 'admin') {
    return { supabase: null, accessToken: null, error: NextResponse.json({ error: '관리자 권한이 필요합니다.' }, { status: 403 }) }
  }

  // Get access token for background job usage
  const { data: { session } } = await supabase.auth.getSession()
  const accessToken = session?.access_token ?? null

  return { supabase, accessToken, error: null }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function applyGroup(bgClient: SupabaseClient<any>, group: NormalizationGroup, jobId: string) {
  const groupErrors: string[] = []
  let groupMerged = 0
  let groupAliasAdded = 0

  // 1. merge_entities RPC for each source
  for (const sourceId of group.mergeIds) {
    if (sourceId === group.canonicalId) continue
    const { error: mergeErr } = await bgClient.rpc('merge_entities', {
      p_source: sourceId,
      p_target: group.canonicalId,
    })
    if (mergeErr) {
      groupErrors.push(`merge ${sourceId}: ${mergeErr.message}`)
    } else {
      groupMerged++
    }
  }

  // 2. alias insert — pre-select to avoid functional-index ON CONFLICT issue
  const cands = (group.newAliases ?? []).map(a => a.trim()).filter(Boolean)
  if (cands.length > 0) {
    // Build OR filter using ilike (case-insensitive) to match lower(alias) index semantics
    const orParts = cands.map(a => `alias.ilike.${a.replace(/[%_]/g, '\\$&')}`)
    const { data: existingRows } = await bgClient
      .from('entity_aliases')
      .select('alias')
      .or(orParts.join(','))

    const existingLowerSet = new Set(
      ((existingRows ?? []) as { alias: string }[]).map(r => r.alias.toLowerCase())
    )
    const fresh = cands.filter(a => !existingLowerSet.has(a.toLowerCase()))

    if (fresh.length > 0) {
      const { error: aliasErr } = await bgClient
        .from('entity_aliases')
        .insert(fresh.map(alias => ({ entity_id: group.canonicalId, alias })))
      if (aliasErr) {
        groupErrors.push(`alias insert: ${aliasErr.message}`)
      } else {
        groupAliasAdded = fresh.length
      }
    }
  }

  // Update job progress
  const job = getMergeJob(jobId)
  if (job) {
    updateMergeJob(jobId, {
      done: job.done + 1,
      merged: job.merged + groupMerged,
      aliasAdded: job.aliasAdded + groupAliasAdded,
      errors: [...job.errors, ...groupErrors],
    })
  }
}

/**
 * POST /api/admin/entities/apply-normalization
 * { groups: NormalizationGroup[] } — 단일 그룹도 배열로 감싸기
 * 백그라운드로 실행 후 jobId 즉시 반환 (202)
 */
export async function POST(request: NextRequest) {
  const { accessToken, error: authError } = await verifyAdmin()
  if (authError) return authError

  let groups: NormalizationGroup[]
  try {
    const body = await request.json() as { groups?: NormalizationGroup[] }
    groups = Array.isArray(body.groups) ? body.groups : []
  } catch {
    return NextResponse.json({ error: '잘못된 요청 바디' }, { status: 400 })
  }

  if (groups.length === 0) {
    return NextResponse.json({ error: 'groups 배열이 비어있습니다.' }, { status: 400 })
  }

  const jobId = createMergeJob(groups.length)

  // Background execution using access token for auth.uid() context in merge_entities RPC
  const token = accessToken
  after(async () => {
    if (!token) {
      updateMergeJob(jobId, {
        errors: ['인증 토큰 없음 — 백그라운드 실행 불가'],
        status: 'done',
      })
      return
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const bgClient: SupabaseClient<any> = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        global: { headers: { Authorization: `Bearer ${token}` } },
        auth: { persistSession: false, autoRefreshToken: false },
      }
    )

    for (const group of groups) {
      if (!group.canonicalId || !Array.isArray(group.mergeIds) || group.mergeIds.length === 0) {
        const job = getMergeJob(jobId)
        if (job) updateMergeJob(jobId, { done: job.done + 1, errors: [...job.errors, `잘못된 그룹: ${group.canonicalName}`] })
        continue
      }
      await applyGroup(bgClient, group, jobId)
    }

    updateMergeJob(jobId, { status: 'done' })
  })

  return NextResponse.json({ jobId }, { status: 202 })
}

/**
 * GET /api/admin/entities/apply-normalization?jobId=
 * 진행 상태 폴링
 */
export async function GET(request: NextRequest) {
  const { error: authError } = await verifyAdmin()
  if (authError) return authError

  const jobId = request.nextUrl.searchParams.get('jobId')
  if (!jobId) {
    return NextResponse.json({ error: 'jobId가 필요합니다.' }, { status: 400 })
  }

  const job = getMergeJob(jobId)
  if (!job) {
    return NextResponse.json({ error: '작업을 찾을 수 없습니다.' }, { status: 404 })
  }

  return NextResponse.json(job)
}
