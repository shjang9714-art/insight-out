import { NextResponse, type NextRequest } from 'next/server'
import { verifyAdminRequest } from '@/lib/admin/verify-admin-request'
import {
  isKnowledgeReportSchemaMissing,
  normalizeKnowledgeKeywords,
  syncKnowledgeReportKeywords,
} from '@/lib/knowledge-reports/admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const ALLOWED_EXTENSIONS = ['pdf', 'pptx']

export async function POST(request: NextRequest) {
  const auth = await verifyAdminRequest()
  if (!auth.ok) return auth.response

  let body: {
    title?: unknown
    summary?: unknown
    keywords?: unknown
    filePath?: unknown
    fileName?: unknown
  }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: '요청 형식이 올바르지 않습니다.' }, { status: 400 })
  }

  const title = typeof body.title === 'string' ? body.title.trim().slice(0, 300) : ''
  const summary = typeof body.summary === 'string' ? body.summary.trim().slice(0, 5000) : ''
  const filePath = typeof body.filePath === 'string' ? body.filePath.trim() : ''
  const fileName = typeof body.fileName === 'string' ? body.fileName.trim() : ''
  const extension = fileName.split('.').pop()?.toLowerCase() ?? ''
  const keywords = normalizeKnowledgeKeywords(body.keywords)

  if (!title || !filePath || !ALLOWED_EXTENSIONS.includes(extension)) {
    return NextResponse.json({ error: '제목과 PDF 또는 PPTX 파일 정보가 필요합니다.' }, { status: 400 })
  }

  const { data, error } = await auth.admin
    .from('contents')
    .insert({
      category: '지식보고서',
      title,
      summary_ko: summary || null,
      file_path: filePath,
      original_language: 'ko',
      author: '내부 지식자료',
      matched_keywords: keywords,
      status: 'published',
      published_at: new Date().toISOString(),
    })
    .select('id, title, summary_ko, file_path, matched_keywords, status, created_at, updated_at')
    .single()

  if (error || !data) {
    console.error('[admin/knowledge-reports] 등록 실패:', error)
    if (isKnowledgeReportSchemaMissing(error)) {
      return NextResponse.json(
        { error: '357-B 지식보고서 카테고리 SQL을 먼저 적용해주세요.' },
        { status: 503 },
      )
    }
    return NextResponse.json({ error: '지식보고서 정보를 저장하지 못했습니다.' }, { status: 500 })
  }

  try {
    await syncKnowledgeReportKeywords(auth.admin, data.id, keywords)
  } catch (keywordError) {
    console.error('[admin/knowledge-reports] 키워드 연결 실패:', keywordError)
  }

  return NextResponse.json({ report: data }, { status: 201 })
}
