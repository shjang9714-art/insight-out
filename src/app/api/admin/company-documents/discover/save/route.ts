import { NextResponse } from 'next/server'
import { verifyAdminRequest } from '@/lib/admin/verify-admin-request'
import { saveCandidates, type Candidate } from '@/lib/company-docs/discovery/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const VALID_PROVIDERS = new Set(['naver', 'tavily'])
const VALID_SOURCE_KINDS = new Set([
  'API', 'RSS', 'SITEMAP', 'HTML_LIST', 'HTML_DETAIL', 'DOCUMENT_DIRECTORY', 'HEADLESS_BROWSER', 'MANUAL',
])

interface SaveBody {
  entityId?: unknown
  candidates?: unknown
}

function parseCandidate(value: unknown): Candidate | null {
  if (typeof value !== 'object' || value === null) return null
  const c = value as Record<string, unknown>
  if (typeof c.url !== 'string' || !c.url.trim()) return null
  if (typeof c.title !== 'string' || !c.title.trim()) return null
  if (typeof c.provider !== 'string' || !VALID_PROVIDERS.has(c.provider)) return null
  if (typeof c.source_kind !== 'string' || !VALID_SOURCE_KINDS.has(c.source_kind)) return null

  return {
    url: c.url,
    title: c.title,
    snippet: typeof c.snippet === 'string' ? c.snippet : undefined,
    source_kind: c.source_kind as Candidate['source_kind'],
    entity_hint: typeof c.entity_hint === 'string' ? c.entity_hint : undefined,
    doc_type_hint: typeof c.doc_type_hint === 'string' ? (c.doc_type_hint as Candidate['doc_type_hint']) : undefined,
    published_hint: typeof c.published_hint === 'string' ? c.published_hint : undefined,
    provider: c.provider as Candidate['provider'],
  }
}

/**
 * POST /api/admin/company-documents/discover/save
 * 검토 화면에서 확정한 후보를 검토대기로 적재한다(자동공개 금지).
 */
export async function POST(request: Request) {
  const auth = await verifyAdminRequest()
  if (!auth.ok) return auth.response

  let body: SaveBody
  try {
    body = await request.json() as SaveBody
  } catch {
    return NextResponse.json({ error: '요청 본문이 올바른 JSON이 아닙니다.' }, { status: 400 })
  }

  const entityId = typeof body.entityId === 'string' && body.entityId.trim() ? body.entityId.trim() : null
  const rawCandidates = Array.isArray(body.candidates) ? body.candidates : []
  const candidates = rawCandidates.map(parseCandidate).filter((c): c is Candidate => c !== null)

  if (candidates.length === 0) {
    return NextResponse.json({ error: '저장할 후보가 없습니다.' }, { status: 400 })
  }

  try {
    const result = await saveCandidates(auth.admin, entityId, candidates)
    return NextResponse.json(result)
  } catch (error) {
    console.error('[/api/admin/company-documents/discover/save] 저장 실패:', error)
    return NextResponse.json(
      { error: '후보 저장 중 오류가 발생했습니다.' },
      { status: 500 },
    )
  }
}
