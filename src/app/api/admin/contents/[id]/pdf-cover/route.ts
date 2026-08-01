import { verifyAdminRequest } from '@/lib/admin/verify-admin-request'
import { NextResponse, type NextRequest } from 'next/server'
import { coverFromPdfFirstPage } from '@/lib/contents/cover-from-pdf'

export const runtime    = 'nodejs'
export const dynamic    = 'force-dynamic'
export const maxDuration = 60

// ─── 관리자 확인 ───────────────────────────────────────────────────────────────


// ─── POST /api/admin/contents/[id]/pdf-cover (291) ────────────────────────────
// "1페이지 다시 가져오기" — 관리자가 명시적으로 누른 경우에 한해 thumbnail_url이
// 있어도 무조건 덮어쓴다(coverFromPdfFirstPage 자체는 가드가 없다 — 호출부 책임).
// 자동 경로(extract·백필)와 달리 여기는 existingThumbnailUrl 체크를 하지 않는다.

interface RouteParams {
  params: Promise<{ id: string }>
}

export async function POST(_req: NextRequest, { params }: RouteParams) {
  const gate = await verifyAdminRequest()
  if (!gate.ok) return gate.response

  const { id } = await params
  const admin = gate.admin

  const { data: content, error: contentErr } = await admin
    .from('contents')
    .select('id, file_path')
    .eq('id', id)
    .single()

  if (contentErr || !content) {
    return NextResponse.json({ error: '콘텐츠를 찾을 수 없습니다.' }, { status: 404 })
  }

  const filePath: string | null = (content as { file_path: string | null }).file_path
  if (!filePath || !filePath.toLowerCase().endsWith('.pdf')) {
    return NextResponse.json({ ok: false, reason: 'not_pdf' as const, message: 'PDF 파일이 아닙니다.' })
  }

  const { data: fileData, error: dlErr } = await admin.storage
    .from('reports')
    .download(filePath)

  if (dlErr || !fileData) {
    console.error('[pdf-cover] Storage 다운로드 실패:', dlErr?.message)
    return NextResponse.json({ error: `PDF 다운로드 실패: ${dlErr?.message ?? '알 수 없는 오류'}` }, { status: 500 })
  }

  const buffer = new Uint8Array(await fileData.arrayBuffer())
  const result = await coverFromPdfFirstPage(admin, id, buffer)

  if (!result.ok) {
    return NextResponse.json({ ok: false, reason: result.reason })
  }
  return NextResponse.json({ ok: true, url: result.url })
}
