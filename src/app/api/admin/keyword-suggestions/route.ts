import { NextRequest, NextResponse } from 'next/server'
import { verifyAdminRequest } from '@/lib/admin/verify-admin-request'
import { classifyRelevance } from '@/lib/crawler/classify'
import { normalizeCompany } from '@/lib/search/company-alias'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const DEFAULT_LIMIT = 10
const MAX_LIMIT = 30
const CONTENT_FETCH_LIMIT = 5000
const ENTITY_FETCH_LIMIT = 1000 // PostgREST max-rows. 이 이상 요청해도 서버가 조용히 자른다 — 넘길 일이 생기면 range() 페이지네이션이 필요하다

interface KeywordScore {
  label: string
  count: number
}

function normalizeKey(value: string): string {
  return value.replace(/\s+/g, '').toLocaleLowerCase('ko-KR')
}

function normalizeLabel(value: string): string {
  const trimmed = value.trim()
  return normalizeCompany(trimmed) ?? trimmed
}

function parseLimit(raw: string | null): number {
  const parsed = Number.parseInt(raw ?? '', 10)
  if (!Number.isFinite(parsed) || parsed < 1) return DEFAULT_LIMIT
  return Math.min(parsed, MAX_LIMIT)
}

function addCandidate(
  candidates: Map<string, KeywordScore>,
  rawLabel: string,
  count: number,
) {
  const label = normalizeLabel(rawLabel)
  if (!label) return

  const key = normalizeKey(label)
  const existing = candidates.get(key)
  if (existing) {
    existing.count += count
    return
  }
  candidates.set(key, { label, count })
}

export async function GET(request: NextRequest) {
  const auth = await verifyAdminRequest()
  if (!auth.ok) return auth.response

  const query = normalizeLabel(request.nextUrl.searchParams.get('q') ?? '')
  const queryKey = normalizeKey(query)
  const limit = parseLimit(request.nextUrl.searchParams.get('limit'))

  const [contentsResult, groupsResult, entitiesResult] = await Promise.all([
    auth.admin
      .from('contents')
      .select('matched_keywords')
      .not('matched_keywords', 'is', null)
      .is('deleted_at', null)
      .limit(CONTENT_FETCH_LIMIT),
    auth.admin
      .from('keyword_groups')
      .select('name')
      .eq('is_active', true),
    auth.admin
      .from('entities')
      .select('canonical_name')
      .in('entity_type', ['company', 'tech'])
      .limit(ENTITY_FETCH_LIMIT),
  ])

  if (contentsResult.error || groupsResult.error || entitiesResult.error) {
    console.error('[keyword-suggestions] 후보 조회 실패:', {
      contents: contentsResult.error?.message,
      groups: groupsResult.error?.message,
      entities: entitiesResult.error?.message,
    })
    return NextResponse.json({ suggestions: [] })
  }

  const candidates = new Map<string, KeywordScore>()

  for (const row of (contentsResult.data ?? []) as { matched_keywords: string[] | null }[]) {
    for (const keyword of row.matched_keywords ?? []) {
      addCandidate(candidates, keyword, 1)
    }
  }
  for (const row of (groupsResult.data ?? []) as { name: string }[]) {
    addCandidate(candidates, row.name, 0)
  }
  for (const row of (entitiesResult.data ?? []) as { canonical_name: string }[]) {
    addCandidate(candidates, row.canonical_name, 0)
  }

  const suggestions = [...candidates.values()]
    .filter(({ label }) => !queryKey || normalizeKey(label).startsWith(queryKey))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'ko'))
    .slice(0, limit)
    .map(({ label }) => label)

  return NextResponse.json({ suggestions })
}

interface AiSuggestionBody {
  title?: unknown
  snippet?: unknown
}

export async function POST(request: NextRequest) {
  const auth = await verifyAdminRequest()
  if (!auth.ok) return auth.response

  let body: AiSuggestionBody
  try {
    body = await request.json() as AiSuggestionBody
  } catch {
    return NextResponse.json({ error: '요청 형식이 올바르지 않습니다.' }, { status: 400 })
  }

  const title = typeof body.title === 'string' ? body.title.trim() : ''
  const snippet = typeof body.snippet === 'string' ? body.snippet.trim() : ''
  if (!title) {
    return NextResponse.json({ error: 'AI 제안을 받으려면 제목을 입력해주세요.' }, { status: 400 })
  }

  const { data: groups, error: groupsError } = await auth.admin
    .from('keyword_groups')
    .select('name')
    .eq('is_active', true)

  if (groupsError) {
    console.error('[keyword-suggestions] AI 분류 그룹 조회 실패:', groupsError.message)
  }

  const groupNames = ((groups ?? []) as { name: string }[]).map(({ name }) => name)
  const verdict = await classifyRelevance(title, snippet, groupNames)
  if (!verdict) {
    return NextResponse.json(
      { error: 'AI 키워드 제안을 생성하지 못했습니다. 수동으로 입력해주세요.' },
      { status: 503 },
    )
  }

  return NextResponse.json({ suggestions: verdict.tags })
}
