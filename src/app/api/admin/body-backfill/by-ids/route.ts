import { NextResponse, type NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { createAdminClient } from '@/lib/supabase/admin'
import { enrichByIds } from '@/lib/contents/enrich-body'

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

/**
 * POST /api/admin/body-backfill/by-ids
 * body: { ids: string[] }
 * 선택한 콘텐츠 ID의 풀본문을 채운다. body_fetched_at 무관, 최대 50건, 270초 타임박스.
 */
export async function POST(request: NextRequest) {
  const denied = await verifyAdmin()
  if (denied) return denied

  const body = await request.json() as { ids?: unknown }
  if (!Array.isArray(body.ids) || body.ids.length === 0) {
    return NextResponse.json({ error: 'ids가 필요합니다.' }, { status: 400 })
  }

  const admin = createAdminClient()
  const result = await enrichByIds(admin, body.ids as string[], {
    deadline: Date.now() + 270_000,
  })
  return NextResponse.json(result)
}
