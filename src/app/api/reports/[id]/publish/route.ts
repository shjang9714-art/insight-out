import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { createAdminClient } from '@/lib/supabase/admin'
import { isValidStorageUrlValue } from '@/lib/storage/resolve-url'

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

interface PublishBody {
  action?: 'publish' | 'unpublish'
  publisher?: string
  published_at?: string
  cover_image_url?: string
}

/**
 * POST /api/reports/[id]/publish
 * body: { action?: 'publish'|'unpublish'(기본 publish), publisher?, published_at?, cover_image_url? }
 * 전략보고서 발행/해제(274, 어드민 전용). published_at is not null = 서비스 노출.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { error: authError } = await verifyAdmin()
    if (authError) return authError

    const { id } = await params

    let body: PublishBody = {}
    try {
      body = await request.json()
    } catch { /* body 없으면 기본값(발행)으로 진행 */ }

    const admin = createAdminClient()
    const isUnpublish = body.action === 'unpublish'
    const coverImageUrl = body.cover_image_url?.trim()
    if (
      body.cover_image_url !== undefined &&
      (!coverImageUrl || !isValidStorageUrlValue(coverImageUrl, 'report-covers'))
    ) {
      return NextResponse.json(
        { error: '올바른 표지 URL 또는 경로가 아닙니다.' },
        { status: 400 },
      )
    }

    const fields: Record<string, unknown> = isUnpublish
      ? { published_at: null }
      : {
          published_at: body.published_at ?? new Date().toISOString(),
          publisher: body.publisher?.trim() || '인사이트 아웃',
          ...(coverImageUrl ? { cover_image_url: coverImageUrl } : {}),
        }

    const { data, error } = await admin
      .from('ai_reports')
      .update(fields)
      .eq('id', id)
      .select('id')
      .single()

    if (error) {
      if ((error as { code?: string }).code === '42703') {
        return NextResponse.json({ error: 'SQL 274(ai_reports 발행 컬럼)가 아직 적용되지 않았습니다.' }, { status: 409 })
      }
      console.error('[publish]', error)
      return NextResponse.json({ error: '발행 처리에 실패했습니다.' }, { status: 500 })
    }
    if (!data) {
      return NextResponse.json({ error: '보고서를 찾을 수 없습니다.' }, { status: 404 })
    }

    return NextResponse.json({ id: data.id, published: !isUnpublish })
  } catch (err) {
    console.error('[publish]', err)
    return NextResponse.json({ error: '발행 처리 중 오류가 발생했습니다.' }, { status: 500 })
  }
}
