import { NextResponse, type NextRequest } from 'next/server'
import { verifyAdminRequest } from '@/lib/admin/verify-admin-request'
import {
  normalizeKnowledgeKeywords,
  syncKnowledgeReportKeywords,
} from '@/lib/knowledge-reports/admin'

interface RouteContext {
  params: Promise<{ id: string }>
}

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const auth = await verifyAdminRequest()
  if (!auth.ok) return auth.response

  const { id } = await params
  let body: { title?: unknown; summary?: unknown; keywords?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: '요청 형식이 올바르지 않습니다.' }, { status: 400 })
  }

  const title = typeof body.title === 'string' ? body.title.trim().slice(0, 300) : ''
  const summary = typeof body.summary === 'string' ? body.summary.trim().slice(0, 5000) : ''
  const keywords = normalizeKnowledgeKeywords(body.keywords)
  if (!title) return NextResponse.json({ error: '제목을 입력해주세요.' }, { status: 400 })

  const { data, error } = await auth.admin
    .from('contents')
    .update({ title, summary_ko: summary || null, matched_keywords: keywords })
    .eq('id', id)
    .eq('category', '지식보고서')
    .select('id, title, summary_ko, file_path, matched_keywords, status, created_at, updated_at')
    .single()

  if (error || !data) {
    return NextResponse.json({ error: '지식보고서를 수정하지 못했습니다.' }, { status: 500 })
  }

  try {
    await syncKnowledgeReportKeywords(auth.admin, id, keywords)
  } catch (keywordError) {
    console.error('[admin/knowledge-reports] 키워드 연결 수정 실패:', keywordError)
  }

  return NextResponse.json({ report: data })
}

export async function DELETE(_request: NextRequest, { params }: RouteContext) {
  const auth = await verifyAdminRequest()
  if (!auth.ok) return auth.response

  const { id } = await params
  const { error } = await auth.admin
    .from('contents')
    .update({ status: 'rejected' })
    .eq('id', id)
    .eq('category', '지식보고서')

  if (error) {
    return NextResponse.json({ error: '지식보고서를 삭제하지 못했습니다.' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
