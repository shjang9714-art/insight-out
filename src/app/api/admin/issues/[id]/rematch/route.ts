import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { createAdminClient } from '@/lib/supabase/admin'
import { semanticFilterIssueContents, type SemanticCandidate } from '@/lib/issues/semantic-match'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

async function verifyAdmin() {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return { error: NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 }) }
  }

  const { data: profile } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!profile || profile.role !== 'admin') {
    return { error: NextResponse.json({ error: '관리자 권한이 필요합니다.' }, { status: 403 }) }
  }

  return { error: null }
}

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { error: authError } = await verifyAdmin()
  if (authError) return authError

  const { id } = await params
  const admin = createAdminClient()

  const { data: issueRow } = await admin
    .from('issues')
    .select('id, title, summary, match_keywords')
    .eq('id', id)
    .single()

  if (!issueRow) return NextResponse.json({ error: '이슈 없음' }, { status: 404 })

  const issue = issueRow as { id: string; title: string; summary: string | null; match_keywords: string[] }
  const keywords = (issue.match_keywords ?? []).filter(Boolean)
  if (keywords.length === 0) {
    return NextResponse.json({ error: 'match_keywords 가 없습니다.' }, { status: 400 })
  }

  // 키워드 ILIKE 후보 추림 (published 만)
  const candMap = new Map<string, SemanticCandidate>()
  for (const kw of keywords) {
    const safe = kw.replace(/[%,]/g, ' ').trim()
    if (!safe) continue
    const { data } = await admin
      .from('contents')
      .select('id, title, summary_ko')
      .eq('status', 'published')
      .or(`title.ilike.%${safe}%,summary_ko.ilike.%${safe}%`)
      .limit(300)
    for (const row of (data ?? []) as SemanticCandidate[]) {
      if (!candMap.has(row.id)) candMap.set(row.id, row)
    }
  }

  const candidates = [...candMap.values()].slice(0, 300)
  if (candidates.length === 0) {
    return NextResponse.json({ candidateCount: 0, matchedCount: 0, mode: 'keyword-fallback' })
  }

  // LLM 의미 검증
  const { matchedIds, mode } = await semanticFilterIssueContents(
    { title: issue.title, summary: issue.summary },
    candidates,
  )

  // issue_contents upsert
  if (matchedIds.length > 0) {
    const rows = matchedIds.map(content_id => ({
      issue_id: id,
      content_id,
      source: mode === 'llm' ? 'claude' : 'rule',
    }))
    const { error: upErr } = await admin
      .from('issue_contents')
      .upsert(rows, { onConflict: 'issue_id,content_id', ignoreDuplicates: true })
    if (upErr) {
      console.error('[issues/rematch] upsert 실패:', upErr.message)
      return NextResponse.json({ error: '배정 저장 실패' }, { status: 500 })
    }
  }

  return NextResponse.json({
    candidateCount: candidates.length,
    matchedCount: matchedIds.length,
    mode,
  })
}
