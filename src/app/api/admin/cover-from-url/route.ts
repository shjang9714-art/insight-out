import { createServerClient } from '@supabase/ssr'
import { createClient as createServiceRoleClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { NextResponse, type NextRequest } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MAX_BYTES = 5 * 1024 * 1024

const EXT_BY_CONTENT_TYPE: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg':  'jpg',
  'image/png':  'png',
  'image/webp': 'webp',
  'image/gif':  'gif',
}

/**
 * POST /api/admin/cover-from-url
 *
 * 관리자 전용 — 외부 이미지 URL(og:image 등)을 서버에서 fetch 해
 * report-covers 버킷으로 복사하고 contents.thumbnail_url 을 갱신한다.
 * 외부 URL을 그대로 저장(핫링크)하지 않기 위한 서버 복사 경로(216).
 *
 * body: { contentId: string, imageUrl: string }
 */
export async function POST(request: NextRequest) {
  // ─── 1. 인증 + 관리자 확인 ─────────────────────────────────────────────────

  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          )
        },
      },
    }
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })
  }

  const { data: profile } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'admin') {
    return NextResponse.json({ error: '관리자 권한이 필요합니다.' }, { status: 403 })
  }

  // ─── 2. 요청 파싱 ─────────────────────────────────────────────────────────

  let body: { contentId?: string; imageUrl?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: '요청 형식이 올바르지 않습니다.' }, { status: 400 })
  }

  const { contentId, imageUrl } = body
  if (!contentId || !imageUrl) {
    return NextResponse.json({ error: '필수 파라미터가 없습니다.' }, { status: 400 })
  }

  let parsedUrl: URL
  try {
    parsedUrl = new URL(imageUrl)
  } catch {
    return NextResponse.json({ error: '올바른 이미지 URL이 아닙니다.' }, { status: 400 })
  }
  if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
    return NextResponse.json({ error: '올바른 이미지 URL이 아닙니다.' }, { status: 400 })
  }

  // ─── 3. 외부 이미지 fetch ─────────────────────────────────────────────────

  let imageRes: Response
  try {
    imageRes = await fetch(parsedUrl.toString(), { signal: AbortSignal.timeout(8000) })
  } catch (err) {
    console.error('[api/admin/cover-from-url] fetch 실패:', err)
    return NextResponse.json({ error: '이미지를 가져오지 못했습니다.' }, { status: 502 })
  }

  if (!imageRes.ok) {
    return NextResponse.json({ error: `이미지 요청 실패 (${imageRes.status})` }, { status: 502 })
  }

  const contentType = imageRes.headers.get('content-type')?.split(';')[0].trim().toLowerCase() ?? ''
  const ext = EXT_BY_CONTENT_TYPE[contentType]
  if (!ext) {
    return NextResponse.json({ error: '이미지 파일이 아닙니다.' }, { status: 415 })
  }

  const arrayBuffer = await imageRes.arrayBuffer()
  if (arrayBuffer.byteLength > MAX_BYTES) {
    return NextResponse.json({ error: '이미지 용량은 5MB 이하여야 합니다.' }, { status: 413 })
  }
  if (arrayBuffer.byteLength === 0) {
    return NextResponse.json({ error: '빈 이미지입니다.' }, { status: 422 })
  }

  // ─── 4. service_role 로 report-covers 업로드 + thumbnail_url 갱신 ─────────

  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceRoleKey) {
    console.error('[api/admin/cover-from-url] SUPABASE_SERVICE_ROLE_KEY 환경변수가 없습니다.')
    return NextResponse.json(
      { error: '서버 설정 오류입니다. 관리자에게 문의하세요.' },
      { status: 500 }
    )
  }

  const adminClient = createServiceRoleClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceRoleKey
  )

  const storagePath = `${contentId}.${ext}`

  const { error: uploadErr } = await adminClient.storage
    .from('report-covers')
    .upload(storagePath, arrayBuffer, { upsert: true, contentType })
  if (uploadErr) {
    console.error('[api/admin/cover-from-url] storage 업로드 실패:', uploadErr)
    return NextResponse.json({ error: `이미지 저장 실패: ${uploadErr.message}` }, { status: 500 })
  }

  const { data: pub } = adminClient.storage.from('report-covers').getPublicUrl(storagePath)
  const thumbnailUrl = `${pub.publicUrl}?v=${Date.now()}`

  const { error: updateErr } = await adminClient
    .from('contents')
    .update({ thumbnail_url: thumbnailUrl })
    .eq('id', contentId)
  if (updateErr) {
    console.error('[api/admin/cover-from-url] thumbnail_url 갱신 실패:', updateErr)
    return NextResponse.json({ error: `콘텐츠 갱신 실패: ${updateErr.message}` }, { status: 500 })
  }

  return NextResponse.json({ thumbnailUrl })
}
