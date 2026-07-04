import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { createAdminClient } from '@/lib/supabase/admin'
import type { OpsRequestRow } from '@/lib/admin/ops-requests'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// verifyAdmin: source-status/route.ts 와 동일하게 복제 (공통 추출은 추후)
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
    return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })
  }

  const { data: profile } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!profile || profile.role !== 'admin') {
    return NextResponse.json({ error: '관리자 권한이 필요합니다.' }, { status: 403 })
  }

  return null
}

const TABLE_MISSING_CODE = '42P01'
const COLUMN_MISSING_CODE = '42703'

/**
 * GET /api/admin/requests?post_type=request|announcement&status=&owner=
 * ops_requests 목록 조회. 테이블 미적용(42P01) → graceful 빈 목록.
 */
export async function GET(req: NextRequest) {
  const authError = await verifyAdmin()
  if (authError) return authError

  const postType = req.nextUrl.searchParams.get('post_type')
  const status = req.nextUrl.searchParams.get('status')
  const owner = req.nextUrl.searchParams.get('owner')

  try {
    const admin = createAdminClient()
    let query = admin
      .from('ops_requests')
      .select('*')
      .order('pinned', { ascending: false })
      .order('updated_at', { ascending: false })

    if (postType) query = query.eq('post_type', postType)
    if (status)   query = query.eq('status', status)
    if (owner)    query = query.eq('owner', owner)

    const { data, error } = await query

    if (error) {
      if (error.code === TABLE_MISSING_CODE) {
        return NextResponse.json({ items: [], tableReady: false })
      }
      throw error
    }

    return NextResponse.json({ items: (data ?? []) as OpsRequestRow[], tableReady: true })
  } catch (err) {
    console.error('[/api/admin/requests GET] 오류(graceful):', err)
    return NextResponse.json({ items: [], tableReady: false })
  }
}

/**
 * POST /api/admin/requests
 * 신규 요청/공지 생성.
 */
export async function POST(req: NextRequest) {
  const authError = await verifyAdmin()
  if (authError) return authError

  const body = await req.json() as Partial<OpsRequestRow>
  const title = body.title?.trim()
  if (!title) {
    return NextResponse.json({ error: '제목을 입력해주세요.' }, { status: 400 })
  }
  const postType = body.post_type === 'announcement' ? 'announcement' : body.post_type === 'work' ? 'work' : 'request'

  const payload: Record<string, unknown> = {
    post_type:  postType,
    title,
    body:       body.body?.trim() || null,
    kind:       body.kind ?? 'other',
    status:     body.status ?? (postType === 'announcement' ? 'active' : 'pending'),
    owner:      body.owner?.trim() || null,
    ref:        body.ref?.trim() || null,
    pinned:     postType === 'announcement' ? Boolean(body.pinned) : false,
    created_by: body.created_by?.trim() || null,
  }
  // 189: work 항목 그룹핑/정렬. phase/seq 컬럼 미적용 환경 대비 42703 graceful 재시도.
  if (postType === 'work') {
    if (body.phase != null) payload.phase = body.phase
    if (body.seq   != null) payload.seq   = body.seq
  }

  try {
    const admin = createAdminClient()
    let insertRes = await admin.from('ops_requests').insert(payload).select('*').single()

    if (insertRes.error?.code === COLUMN_MISSING_CODE && ('phase' in payload || 'seq' in payload)) {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { phase: _phase, seq: _seq, ...withoutWorkCols } = payload
      insertRes = await admin.from('ops_requests').insert(withoutWorkCols).select('*').single()
    }

    const { data, error } = insertRes
    if (error) {
      if (error.code === TABLE_MISSING_CODE) {
        return NextResponse.json(
          { error: 'ops_requests 테이블이 아직 적용되지 않았습니다.', tableReady: false },
          { status: 503 }
        )
      }
      throw error
    }

    return NextResponse.json({ item: data as OpsRequestRow })
  } catch (err) {
    console.error('[/api/admin/requests POST] 오류:', err)
    return NextResponse.json({ error: '생성에 실패했습니다.' }, { status: 500 })
  }
}

/**
 * PATCH /api/admin/requests
 * 상태/담당/참조/고정/제목/본문 부분 수정. body.id 필수.
 * status='done' 전환 시 resolved_at 은 DB 트리거(187 SQL)가 자동 세팅.
 */
export async function PATCH(req: NextRequest) {
  const authError = await verifyAdmin()
  if (authError) return authError

  const body = await req.json() as Partial<OpsRequestRow> & { id?: string }
  const { id, ...rest } = body
  if (!id) {
    return NextResponse.json({ error: 'id가 필요합니다.' }, { status: 400 })
  }

  const allowedFields: (keyof OpsRequestRow)[] = ['title', 'body', 'kind', 'status', 'owner', 'ref', 'pinned', 'phase', 'seq']
  const updatePayload: Record<string, unknown> = {}
  for (const key of allowedFields) {
    if (key in rest) updatePayload[key] = rest[key as keyof typeof rest]
  }

  if (Object.keys(updatePayload).length === 0) {
    return NextResponse.json({ error: '수정할 필드가 없습니다.' }, { status: 400 })
  }

  try {
    const admin = createAdminClient()
    let updateRes = await admin.from('ops_requests').update(updatePayload).eq('id', id).select('*').single()

    if (updateRes.error?.code === COLUMN_MISSING_CODE && ('phase' in updatePayload || 'seq' in updatePayload)) {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { phase: _phase, seq: _seq, ...withoutWorkCols } = updatePayload
      if (Object.keys(withoutWorkCols).length > 0) {
        updateRes = await admin.from('ops_requests').update(withoutWorkCols).eq('id', id).select('*').single()
      }
    }

    const { data, error } = updateRes
    if (error) {
      if (error.code === TABLE_MISSING_CODE) {
        return NextResponse.json(
          { error: 'ops_requests 테이블이 아직 적용되지 않았습니다.', tableReady: false },
          { status: 503 }
        )
      }
      throw error
    }

    return NextResponse.json({ item: data as OpsRequestRow })
  } catch (err) {
    console.error('[/api/admin/requests PATCH] 오류:', err)
    return NextResponse.json({ error: '수정에 실패했습니다.' }, { status: 500 })
  }
}
