import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { getReportSignedUrl } from '@/lib/contents/report-url'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * GET /api/contents/[id]/report-url
 * 리포트 서명 URL 재발급(307) — 인라인 PDF 뷰어가 2시간 만료 뒤 range 요청에
 * 실패하면 이 라우트로 새 서명 URL을 받아 1회 재시도한다.
 * ?download=파일명 을 주면 그 파일명으로 다운로드되는 서명 URL을 만든다.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll() }, setAll() {} } },
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })
  }

  const { data } = await supabase
    .from('contents')
    .select('file_path')
    .eq('id', id)
    .eq('status', 'published')
    .single()

  const filePath = (data as { file_path: string | null } | null)?.file_path
  if (!filePath) {
    return NextResponse.json({ error: '파일을 찾을 수 없습니다.' }, { status: 404 })
  }

  const downloadName = request.nextUrl.searchParams.get('download') ?? undefined
  const url = await getReportSignedUrl(filePath, downloadName)
  if (!url) {
    return NextResponse.json({ error: '서명 URL 생성에 실패했습니다.' }, { status: 500 })
  }
  return NextResponse.json({ url })
}
