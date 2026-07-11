import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { createAdminClient } from '@/lib/supabase/admin'

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

interface CoverBody {
  cover_image_url?: string
}

/**
 * POST /api/admin/reports/[id]/cover
 * 표지 업로드 후 URL만 ai_reports.cover_image_url 에 즉시 저장(276).
 * 업로드 자체는 클라이언트가 uploadCoverFile()로 report-covers 버킷에 직접 수행(DB 미기록) —
 * 이 라우트는 그 결과 URL을 ai_reports 에 반영할 뿐, contents 테이블은 건드리지 않는다.
 * (⚠️ uploadCover()는 contents.thumbnail_url을 갱신하므로 절대 사용 금지 — uploadCoverFile()만 사용.)
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { error: authError } = await verifyAdmin()
  if (authError) return authError

  const { id } = await params

  let body: CoverBody
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: '요청 형식이 올바르지 않습니다.' }, { status: 400 })
  }

  const coverImageUrl = body.cover_image_url?.trim()
  if (!coverImageUrl) {
    return NextResponse.json({ error: 'cover_image_url이 필요합니다.' }, { status: 400 })
  }

  let parsed: URL
  try {
    parsed = new URL(coverImageUrl)
  } catch {
    return NextResponse.json({ error: '올바른 URL이 아닙니다.' }, { status: 400 })
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return NextResponse.json({ error: '올바른 URL이 아닙니다.' }, { status: 400 })
  }

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('ai_reports')
    .update({ cover_image_url: coverImageUrl })
    .eq('id', id)
    .select('id')
    .single()

  if (error) {
    console.error('[admin/reports/cover]', error)
    return NextResponse.json({ error: '표지 저장에 실패했습니다.' }, { status: 500 })
  }
  if (!data) {
    return NextResponse.json({ error: '보고서를 찾을 수 없습니다.' }, { status: 404 })
  }

  return NextResponse.json({ id: data.id, cover_image_url: coverImageUrl })
}
