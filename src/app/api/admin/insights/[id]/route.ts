import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { createAdminClient } from '@/lib/supabase/admin'
import type { InsightCardStatus } from '@/lib/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

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

const VALID_STATUSES: InsightCardStatus[] = ['draft', 'published', 'archived']

/**
 * PATCH /api/admin/insights/[id]
 * body: { status: InsightCardStatus }
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { error: authError } = await verifyAdmin()
    if (authError) return authError

    const { id } = await params
    const body = await request.json() as Record<string, unknown>
    const status = body.status as InsightCardStatus

    if (!VALID_STATUSES.includes(status)) {
      return NextResponse.json(
        { error: '유효하지 않은 상태값입니다.' },
        { status: 400 }
      )
    }

    const admin = createAdminClient()
    const { data, error } = await admin
      .from('insight_cards')
      .update({ status })
      .eq('id', id)
      .select('id, status')
      .single()

    if (error) throw error

    return NextResponse.json(data)
  } catch (err) {
    console.error('[PATCH /api/admin/insights/[id]] 오류:', err)
    return NextResponse.json(
      { error: '상태 변경에 실패했습니다.' },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/admin/insights/[id]
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { error: authError } = await verifyAdmin()
    if (authError) return authError

    const { id } = await params
    const admin = createAdminClient()
    const { error } = await admin
      .from('insight_cards')
      .delete()
      .eq('id', id)

    if (error) throw error

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[DELETE /api/admin/insights/[id]] 오류:', err)
    return NextResponse.json(
      { error: '삭제에 실패했습니다.' },
      { status: 500 }
    )
  }
}
