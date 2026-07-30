import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse, type NextRequest } from 'next/server'
import {
  BULK_REVIEW_LIMIT,
  parseBulkReviewRequest,
  resolveBulkReviewCategories,
  type BulkReviewFilters,
} from '@/lib/admin/bulk-review'
import { getKstTodayStartIso } from '@/lib/date'
import { runJob } from '@/lib/jobs/run-job'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface FilterBuilder {
  eq(column: string, value: unknown): FilterBuilder
  gte(column: string, value: unknown): FilterBuilder
  ilike(column: string, pattern: string): FilterBuilder
  in(column: string, values: readonly unknown[]): FilterBuilder
  is(column: string, value: null): FilterBuilder
  lt(column: string, value: number): FilterBuilder
  not(column: string, operator: string, value: unknown): FilterBuilder
}

function applyBulkReviewFilters(query: FilterBuilder, filters: BulkReviewFilters): FilterBuilder {
  const categories = resolveBulkReviewCategories(filters.category)
  if (categories?.length === 1) query = query.eq('category', categories[0])
  else if (categories && categories.length > 1) query = query.in('category', categories)

  if (filters.sourceId === 'null') query = query.is('source_id', null)
  else if (filters.sourceId) query = query.eq('source_id', filters.sourceId)

  if (filters.reviewReason) query = query.eq('review_reason', filters.reviewReason)
  if (filters.bodyFilter === 'none') query = query.is('body_fetched_at', null)
  if (filters.bodyFilter === 'full') {
    query = query.not('body_fetched_at', 'is', null).gte('body_len', 400)
  }
  if (filters.bodyFilter === 'snippet') {
    query = query.not('body_fetched_at', 'is', null).lt('body_len', 400)
  }
  if (filters.todayOnly) query = query.gte('collected_at', getKstTodayStartIso())
  if (filters.searchTerm) query = query.ilike('title', `%${filters.searchTerm}%`)

  return query
}

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
    return {
      denied: NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 }),
      userId: null,
    }
  }

  const { data: profile } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!profile || profile.role !== 'admin') {
    return {
      denied: NextResponse.json({ error: '관리자 권한이 필요합니다.' }, { status: 403 }),
      userId: null,
    }
  }

  return { denied: null, userId: user.id }
}

/**
 * POST /api/admin/contents/bulk-review
 * 클라이언트 ID 배열 없이 서버가 현재 필터와 일치하는 pending 콘텐츠만 일괄 반려한다.
 */
export async function POST(request: NextRequest) {
  const { denied, userId } = await verifyAdmin()
  if (denied) return denied

  let rawBody: unknown
  try {
    rawBody = await request.json()
  } catch {
    return NextResponse.json({ error: '요청 본문을 읽을 수 없습니다.' }, { status: 400 })
  }

  const parsed = parseBulkReviewRequest(rawBody)
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 })
  }

  const admin = createAdminClient()
  const countBase = admin
    .from('contents')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'pending')
  const countQuery = applyBulkReviewFilters(
    countBase as unknown as FilterBuilder,
    parsed.value,
  ) as unknown as typeof countBase
  const { count, error: countError } = await countQuery

  if (countError) {
    console.error('[bulk-review] 대상 건수 조회 실패:', countError.message)
    return NextResponse.json({ error: '대상 건수를 확인하지 못했습니다.' }, { status: 500 })
  }

  const actualCount = count ?? 0
  if (actualCount > BULK_REVIEW_LIMIT) {
    return NextResponse.json(
      { error: `대상이 ${BULK_REVIEW_LIMIT.toLocaleString('ko-KR')}건을 초과합니다. 필터를 더 좁혀주세요.` },
      { status: 400 },
    )
  }
  if (actualCount !== parsed.value.expectedCount) {
    return NextResponse.json(
      {
        error: '미리보기 이후 대상 건수가 변경되었습니다. 다시 미리보기해주세요.',
        expectedCount: parsed.value.expectedCount,
        actualCount,
      },
      { status: 409 },
    )
  }

  const result = await runJob(
    admin,
    {
      key: 'admin:bulk-review',
      trigger: 'admin',
      startedBy: userId ?? undefined,
    },
    async () => {
      const updateBase = admin
        .from('contents')
        .update({ status: 'rejected' }, { count: 'exact' })
        .eq('status', 'pending')
      const updateQuery = applyBulkReviewFilters(
        updateBase as unknown as FilterBuilder,
        parsed.value,
      ) as unknown as typeof updateBase
      const { count: processed, error: updateError } = await updateQuery

      if (updateError) throw new Error(`조건 일괄 반려 실패: ${updateError.message}`)
      return { processed: processed ?? 0 }
    },
  )

  return NextResponse.json(result)
}
