import { verifyAdminRequest } from '@/lib/admin/verify-admin-request'
import { NextRequest, NextResponse } from 'next/server'
import { semanticFilterIssueContents, type SemanticCandidate } from '@/lib/issues/semantic-match'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120


export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const gate = await verifyAdminRequest()
  if (!gate.ok) return gate.response

  const { id } = await params
  const admin = gate.admin

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
