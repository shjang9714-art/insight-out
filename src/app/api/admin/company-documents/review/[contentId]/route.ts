import { NextResponse, type NextRequest } from 'next/server'
import { verifyAdminRequest } from '@/lib/admin/verify-admin-request'
import { COMPANY_DOC_TYPES, DOC_GROUP_BY_TYPE } from '@/lib/company-docs/constants'
import type { CompanyDocumentType } from '@/lib/types'

export const dynamic = 'force-dynamic'

interface RouteParams {
  params: Promise<{ contentId: string }>
}

interface ActionBody {
  action?: unknown
  entityId?: unknown
  docType?: unknown
  publishedOn?: unknown
  prevContentId?: unknown
}

function hostnameOf(url: string): string | null {
  try {
    return new URL(url).hostname
  } catch {
    return null
  }
}

/**
 * PATCH /api/admin/company-documents/review/[contentId]
 * 355-C ③ 검토함 행별 액션 — 승인·기업변경·유형변경·발행일수정·이전버전연결·제외·소스차단.
 * 액션마다 별도 route를 만드는 대신 action 파라미터로 분기해 최소 SQL 왕복을 유지한다.
 */
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const auth = await verifyAdminRequest()
  if (!auth.ok) return auth.response
  const { contentId } = await params

  let body: ActionBody
  try {
    body = await request.json() as ActionBody
  } catch {
    return NextResponse.json({ error: '요청 본문이 올바른 JSON이 아닙니다.' }, { status: 400 })
  }

  const { data: doc, error: docError } = await auth.admin
    .from('company_documents')
    .select('content_id, entity_id, doc_type, contents!company_documents_content_id_fkey(original_url)')
    .eq('content_id', contentId)
    .maybeSingle()
  if (docError) {
    console.error('[company-documents/review] 문서 조회 실패:', docError)
    return NextResponse.json({ error: '문서를 조회하지 못했습니다.' }, { status: 500 })
  }
  if (!doc) {
    return NextResponse.json({ error: '검토대기 문서를 찾을 수 없습니다.' }, { status: 404 })
  }

  switch (body.action) {
    case 'approve': {
      const { error } = await auth.admin
        .from('company_documents')
        .update({ review_status: 'none' })
        .eq('content_id', contentId)
      if (error) return NextResponse.json({ error: '승인에 실패했습니다.' }, { status: 500 })
      await auth.admin.from('contents').update({ status: 'published' }).eq('id', contentId)
      return NextResponse.json({ ok: true })
    }

    case 'exclude': {
      const { error } = await auth.admin
        .from('company_documents')
        .update({ review_status: '제외' })
        .eq('content_id', contentId)
      if (error) return NextResponse.json({ error: '제외 처리에 실패했습니다.' }, { status: 500 })
      await auth.admin.from('contents').update({ status: 'rejected' }).eq('id', contentId)
      return NextResponse.json({ ok: true })
    }

    case 'changeEntity': {
      const entityId = typeof body.entityId === 'string' && body.entityId.trim() ? body.entityId.trim() : null
      const { error } = await auth.admin
        .from('company_documents')
        .update({ entity_id: entityId })
        .eq('content_id', contentId)
      if (error) return NextResponse.json({ error: '기업 변경에 실패했습니다.' }, { status: 500 })
      if (entityId) {
        const { error: entityError } = await auth.admin.from('content_entities').upsert({
          content_id: contentId,
          entity_id: entityId,
          source: 'review-inbox',
          score: 1,
        }, { onConflict: 'content_id,entity_id' })
        if (entityError) console.error('[company-documents/review] content_entities 연결 실패:', entityError.message)
      }
      return NextResponse.json({ ok: true })
    }

    case 'changeDocType': {
      const docType = typeof body.docType === 'string' ? body.docType : ''
      if (!COMPANY_DOC_TYPES.includes(docType as CompanyDocumentType)) {
        return NextResponse.json({ error: '문서 유형이 올바르지 않습니다.' }, { status: 400 })
      }
      const { error } = await auth.admin
        .from('company_documents')
        .update({ doc_type: docType, doc_group: DOC_GROUP_BY_TYPE[docType as CompanyDocumentType] })
        .eq('content_id', contentId)
      if (error) return NextResponse.json({ error: '유형 변경에 실패했습니다.' }, { status: 500 })
      return NextResponse.json({ ok: true })
    }

    case 'changePublishedOn': {
      const publishedOn = typeof body.publishedOn === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.publishedOn)
        ? body.publishedOn
        : null
      if (!publishedOn) return NextResponse.json({ error: '발행일 형식이 올바르지 않습니다.' }, { status: 400 })
      const { error } = await auth.admin
        .from('company_documents')
        .update({ published_on: publishedOn })
        .eq('content_id', contentId)
      if (error) return NextResponse.json({ error: '발행일 수정에 실패했습니다.' }, { status: 500 })
      await auth.admin.from('contents').update({ published_at: `${publishedOn}T00:00:00+09:00` }).eq('id', contentId)
      return NextResponse.json({ ok: true })
    }

    case 'linkVersion': {
      const prevContentId = typeof body.prevContentId === 'string' && body.prevContentId.trim() ? body.prevContentId.trim() : null
      if (!prevContentId) return NextResponse.json({ error: '이전 버전 문서 ID를 입력해주세요.' }, { status: 400 })

      const { data: prevDoc, error: prevError } = await auth.admin
        .from('company_documents')
        .select('content_id, version_group_id')
        .eq('content_id', prevContentId)
        .maybeSingle()
      if (prevError || !prevDoc) {
        return NextResponse.json({ error: '이전 버전 문서를 찾을 수 없습니다.' }, { status: 404 })
      }

      const versionGroupId = prevDoc.version_group_id ?? crypto.randomUUID()
      if (!prevDoc.version_group_id) {
        const { error } = await auth.admin
          .from('company_documents')
          .update({ version_group_id: versionGroupId })
          .eq('content_id', prevContentId)
        if (error) return NextResponse.json({ error: '이전 버전 그룹 생성에 실패했습니다.' }, { status: 500 })
      }

      const { error } = await auth.admin
        .from('company_documents')
        .update({ version_group_id: versionGroupId, prev_content_id: prevContentId })
        .eq('content_id', contentId)
      if (error) return NextResponse.json({ error: '버전 연결에 실패했습니다.' }, { status: 500 })
      return NextResponse.json({ ok: true })
    }

    case 'blockSource': {
      const originalUrl = (() => {
        const contents = doc.contents as { original_url: string | null } | { original_url: string | null }[] | null
        const row = Array.isArray(contents) ? contents[0] : contents
        return row?.original_url ?? null
      })()
      const hostname = originalUrl ? hostnameOf(originalUrl) : null
      if (!doc.entity_id || !hostname) {
        return NextResponse.json({
          ok: true,
          skipped: true,
          message: '연결된 기업 또는 원문 URL이 없어 자동으로 차단할 소스를 찾지 못했습니다. 소스 레지스트리에서 직접 비활성화해주세요.',
        })
      }

      const { data: sources } = await auth.admin
        .from('document_sources')
        .select('id, url')
        .eq('entity_id', doc.entity_id)
        .eq('is_active', true)
      const matched = (sources ?? []).filter((s: { id: string; url: string }) => hostnameOf(s.url) === hostname)
      if (matched.length === 0) {
        return NextResponse.json({
          ok: true,
          skipped: true,
          message: `이 기업에 "${hostname}" 도메인으로 등록된 활성 소스가 없습니다.`,
        })
      }

      const { error } = await auth.admin
        .from('document_sources')
        .update({ is_active: false, error_state: '검토함에서 차단됨' })
        .in('id', matched.map((s: { id: string }) => s.id))
      if (error) return NextResponse.json({ error: '소스 차단에 실패했습니다.' }, { status: 500 })
      return NextResponse.json({ ok: true, blockedCount: matched.length })
    }

    default:
      return NextResponse.json({ error: '알 수 없는 액션입니다.' }, { status: 400 })
  }
}
