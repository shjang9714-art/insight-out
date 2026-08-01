import { verifyAdminRequest } from '@/lib/admin/verify-admin-request'
import { NextResponse, type NextRequest } from 'next/server'
import { getReportSignedUrl } from '@/lib/contents/report-url'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// ─── 관리자 확인 ───────────────────────────────────────────────────────────────


// ─── GET /api/admin/contents/[id]/file-url (368) ──────────────────────────────
// 관리자 편집 모달의 "원문 열기" 버튼 — 저장된 원문 파일(file_path)의 서명 URL을
// 발급해 새 탭으로 열 수 있게 한다.

interface RouteParams {
  params: Promise<{ id: string }>
}

export async function GET(_req: NextRequest, { params }: RouteParams) {
  const gate = await verifyAdminRequest()
  if (!gate.ok) return gate.response

  const { id } = await params
  const admin = gate.admin

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
