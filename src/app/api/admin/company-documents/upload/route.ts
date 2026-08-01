import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { titleHash } from '@/lib/crawler/normalize'
import { COMPANY_DOC_TYPES, DOC_GROUP_BY_TYPE } from '@/lib/company-docs/constants'
import type { CompanyDocumentType } from '@/lib/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

interface UploadBody {
  entityId?: unknown
  title?: unknown
  docType?: unknown
  isOfficial?: unknown
  publishedOn?: unknown
  summary?: unknown
  filePath?: unknown
  immediatePublish?: unknown
}

/**
 * POST /api/admin/company-documents/upload
 * 355-C ② — KnowledgeReportUploadForm 패턴을 재사용한 기업자료 수동 업로드 통.
 * 서명URL로 Storage 업로드까지 끝낸 뒤 이 route가 contents+company_documents를 적재한다.
 *
 * 로그인 사용자면 누구나 호출 가능(조직 내 업로드 경로, 355-B 대비) — 단 관리자가 아니면
 * 항상 review_status='검토대기'로 강제하고, is_official·즉시공개는 무시한다.
 * ※ 현재는 이 도메인 안의 서명URL 발급(/api/admin/upload)이 관리자만 허용해 이 분기가
 * 어드민 업로드 폼에서만 실제로 호출된다 — 355-B 사용자 업로드 UI가 생기면 그쪽은
 * 별도 서명URL 경로가 필요하다.
 */
export async function POST(request: Request) {
  // 485: 의도된 예외 — verifyAdminRequest 대상 아님
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })
  }
  const { data: profile } = await supabase.from('users').select('role').eq('id', user.id).single()
  const isAdmin = profile?.role === 'admin'

  let body: UploadBody
  try {
    body = await request.json() as UploadBody
  } catch {
    return NextResponse.json({ error: '요청 본문이 올바른 JSON이 아닙니다.' }, { status: 400 })
  }

  const entityId = typeof body.entityId === 'string' && body.entityId.trim() ? body.entityId.trim() : null
  const title = typeof body.title === 'string' ? body.title.trim() : ''
  const docType = typeof body.docType === 'string' ? body.docType : ''
  const filePath = typeof body.filePath === 'string' ? body.filePath.trim() : ''
  const summary = typeof body.summary === 'string' && body.summary.trim() ? body.summary.trim() : null
  const publishedOn = typeof body.publishedOn === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.publishedOn)
    ? body.publishedOn
    : null

  if (!title || !filePath) {
    return NextResponse.json({ error: '제목과 업로드 파일은 필수입니다.' }, { status: 400 })
  }
  if (!COMPANY_DOC_TYPES.includes(docType as CompanyDocumentType)) {
    return NextResponse.json({ error: '문서 유형이 올바르지 않습니다.' }, { status: 400 })
  }

  const isOfficial = isAdmin && body.isOfficial === true
  const immediatePublish = isAdmin && body.immediatePublish === true
  const reviewStatus = immediatePublish ? 'none' : '검토대기'
  const docGroup = DOC_GROUP_BY_TYPE[docType as CompanyDocumentType]

  const admin = createAdminClient()

  const { data: content, error: contentError } = await admin
    .from('contents')
    .insert({
      category: '기업자료',
      title,
      summary_ko: summary,
      file_path: filePath,
      original_language: 'ko',
      title_hash: titleHash(title),
      published_at: publishedOn ? `${publishedOn}T00:00:00+09:00` : null,
      status: immediatePublish ? 'published' : 'pending',
    })
    .select('id')
    .single()

  if (contentError || !content) {
    console.error('[company-documents/upload] contents 저장 실패:', contentError?.message)
    return NextResponse.json({ error: '문서 정보를 저장하지 못했습니다.' }, { status: 500 })
  }
  const contentId = (content as { id: string }).id

  const { error: docError } = await admin.from('company_documents').insert({
    content_id: contentId,
    entity_id: entityId,
    doc_type: docType,
    doc_group: docGroup,
    is_official: isOfficial,
    source_kind: 'MANUAL',
    official_status: isOfficial ? '공식원문링크' : '수동 업로드(미검증)',
    access_scope: 'public',
    ingest_status: 'manual',
    review_status: reviewStatus,
    published_on: publishedOn,
  })

  if (docError) {
    await admin.from('contents').delete().eq('id', contentId)
    console.error('[company-documents/upload] company_documents 저장 실패:', docError.message)
    return NextResponse.json({ error: '기업자료 정보를 저장하지 못했습니다.' }, { status: 500 })
  }

  if (entityId) {
    const { error: entityError } = await admin.from('content_entities').upsert({
      content_id: contentId,
      entity_id: entityId,
      source: 'manual-upload',
      score: 1,
    }, { onConflict: 'content_id,entity_id' })
    if (entityError) console.error('[company-documents/upload] content_entities 연결 실패:', entityError.message)
  }

  return NextResponse.json({ contentId, reviewStatus })
}
