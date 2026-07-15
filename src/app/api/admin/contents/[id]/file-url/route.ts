import { NextResponse, type NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { createAdminClient } from '@/lib/supabase/admin'
import { getReportSignedUrl } from '@/lib/contents/report-url'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// ─── 관리자 확인 ───────────────────────────────────────────────────────────────

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

// ─── GET /api/admin/contents/[id]/file-url (368) ──────────────────────────────
// 관리자 편집 모달의 "원문 열기" 버튼 — 저장된 원문 파일(file_path)의 서명 URL을
// 발급해 새 탭으로 열 수 있게 한다.

interface RouteParams {
  params: Promise<{ id: string }>
}

export async function GET(_req: NextRequest, { params }: RouteParams) {
  const authErr = await verifyAdmin()
  if (authErr) return authErr

  const { id } = await params
  const admin = createAdminClient()

  const { data: content, error: contentErr } = await admin
    .from('contents')
    .select('file_path')
    .eq('id', id)
    .single()

  if (contentErr || !content) {
    return NextResponse.json({ error: '콘텐츠를 찾을 수 없습니다.' }, { status: 404 })
  }

  const filePath: string | null = (content as { file_path: string | null }).file_path
  if (!filePath) {
    return NextResponse.json({ error: '원문 파일이 없습니다.' }, { status: 404 })
  }

  const url = await getReportSignedUrl(filePath)
  if (!url) {
    return NextResponse.json({ error: '서명 URL 생성에 실패했습니다.' }, { status: 500 })
  }
  return NextResponse.json({ url })
}
