import { createServerClient } from '@supabase/ssr'
import { createClient as createServiceRoleClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { NextResponse, type NextRequest } from 'next/server'
import { sha256 } from '@/lib/crawler/normalize'

function safeSegment(value: string): string {
  const normalized = value
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9._-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^[._-]+|[._-]+$/g, '')

  return normalized || `pub-${sha256(value).slice(0, 8)}`
}

/**
 * POST /api/admin/upload
 *
 * 관리자 전용 — Supabase Storage "reports" 버킷에 파일을 올릴 수 있는
 * 서명된 업로드 URL (token) 을 발급한다.
 *
 * 흐름:
 *   1. 세션 + 관리자 역할 확인 (서버 클라이언트 · anon key)
 *   2. 스토리지 경로 생성: {safeCategory}/{year}/{uuid}.{ext}
 *   3. service_role 키로 createSignedUploadUrl 호출
 *   4. { token, storagePath } 반환 → 클라이언트가 uploadToSignedUrl 로 직접 업로드
 *
 * 파일 자체는 이 Route Handler 를 거치지 않으므로 Vercel 요청 크기 한도 무관.
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

  let body: { filename?: string; category?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: '요청 형식이 올바르지 않습니다.' }, { status: 400 })
  }

  const { filename, category } = body
  if (!filename || !category) {
    return NextResponse.json(
      { error: '필수 파라미터(filename, category)가 없습니다.' },
      { status: 400 }
    )
  }

  // ─── 3. 서명된 업로드 URL 생성 (service_role) ─────────────────────────────

  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceRoleKey) {
    console.error('[api/admin/upload] SUPABASE_SERVICE_ROLE_KEY 환경변수가 없습니다.')
    return NextResponse.json(
      { error: '서버 설정 오류입니다. 관리자에게 문의하세요.' },
      { status: 500 }
    )
  }

  const adminClient = createServiceRoleClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceRoleKey
  )

  const ext =
    filename.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '') || 'bin'
  const safeCategory = safeSegment(category)
  const year        = new Date().getFullYear()
  const storagePath = `${safeCategory}/${year}/${crypto.randomUUID()}.${ext}`

  const { data: signedData, error: signedErr } = await adminClient.storage
    .from('reports')
    .createSignedUploadUrl(storagePath)

  if (signedErr) {
    console.error('[api/admin/upload] createSignedUploadUrl 실패:', signedErr)

    if (
      signedErr.message.toLowerCase().includes('bucket not found') ||
      signedErr.message.toLowerCase().includes('bucket')
    ) {
      return NextResponse.json(
        {
          error:
            '스토리지 버킷 "reports" 가 없습니다. ' +
            'Supabase 대시보드 > Storage > New bucket 에서 이름 "reports", ' +
            '공개 설정 OFF 로 버킷을 생성해주세요.',
        },
        { status: 500 }
      )
    }

    return NextResponse.json(
      { error: `서명 URL 생성 실패: ${signedErr.message}` },
      { status: 500 }
    )
  }

  return NextResponse.json({
    token:       signedData.token,
    storagePath,
  })
}
