import { NextResponse } from 'next/server'
import { verifyAdminRequest } from '@/lib/admin/verify-admin-request'
import { naverProvider } from '@/lib/company-docs/discovery/naver'
import { tavilyProvider } from '@/lib/company-docs/discovery/tavily'
import type { DiscoveryProvider } from '@/lib/company-docs/discovery/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const PROVIDERS: Record<string, DiscoveryProvider> = {
  naver: naverProvider,
  tavily: tavilyProvider,
}

interface DiscoverBody {
  entityName?: unknown
  provider?: unknown
  query?: unknown
}

/**
 * POST /api/admin/company-documents/discover
 * 후보를 "찾기"만 한다 — 저장은 하지 않는다(어드민이 검토 후 /discover/save 로 확정).
 */
export async function POST(request: Request) {
  const auth = await verifyAdminRequest()
  if ('response' in auth) return auth.response

  let body: DiscoverBody
  try {
    body = await request.json() as DiscoverBody
  } catch {
    return NextResponse.json({ error: '요청 본문이 올바른 JSON이 아닙니다.' }, { status: 400 })
  }

  const entityName = typeof body.entityName === 'string' ? body.entityName.trim() : ''
  const providerKey = typeof body.provider === 'string' ? body.provider : ''
  const query = typeof body.query === 'string' ? body.query : undefined

  if (!entityName) {
    return NextResponse.json({ error: '기업명을 입력해주세요.' }, { status: 400 })
  }
  const provider = PROVIDERS[providerKey]
  if (!provider) {
    return NextResponse.json({ error: `알 수 없는 provider: ${providerKey}` }, { status: 400 })
  }

  try {
    const result = await provider.search({ entityName, query, admin: auth.admin })
    return NextResponse.json(result)
  } catch (error) {
    console.error(`[/api/admin/company-documents/discover] ${providerKey} 검색 실패:`, error)
    return NextResponse.json(
      { error: '발견 검색 중 오류가 발생했습니다.' },
      { status: 502 },
    )
  }
}
