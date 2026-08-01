import { verifyAdminRequest } from '@/lib/admin/verify-admin-request'
import { NextRequest, NextResponse } from 'next/server'
import { isValidStorageUrlValue } from '@/lib/storage/resolve-url'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'


interface CoverBody {
  cover_image_url?: string
}

/**
 * POST /api/admin/reports/[id]/cover
 * 표지 업로드 후 버킷 상대 path를 ai_reports.cover_image_url 에 즉시 저장(276).
 * 업로드 자체는 클라이언트가 uploadCoverFile()로 report-covers 버킷에 직접 수행(DB 미기록) —
 * 이 라우트는 그 결과 path를 ai_reports 에 반영할 뿐, contents 테이블은 건드리지 않는다.
 * (⚠️ uploadCover()는 contents.thumbnail_url을 갱신하므로 절대 사용 금지 — uploadCoverFile()만 사용.)
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const gate = await verifyAdminRequest()
  if (!gate.ok) return gate.response

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

  if (!isValidStorageUrlValue(coverImageUrl, 'report-covers')) {
    return NextResponse.json({ error: '올바른 표지 URL 또는 경로가 아닙니다.' }, { status: 400 })
  }

  const admin = gate.admin
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
