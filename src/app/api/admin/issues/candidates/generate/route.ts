import { verifyAdminRequest } from '@/lib/admin/verify-admin-request'
import { NextRequest, NextResponse } from 'next/server'
import { generateIssueCandidates } from '@/lib/issues/generate-candidates'
import { issueAutoPublish } from '@/lib/insight/auto-publish'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120


/**
 * POST /api/admin/issues/candidates/generate
 * body: { days?: number; maxCandidates?: number; minGroupSize?: number }
 */
export async function POST(request: NextRequest) {
  const gate = await verifyAdminRequest()
  if (!gate.ok) return gate.response

  try {
    const body = await request.json().catch(() => ({})) as {
      days?: number
      maxCandidates?: number
      minGroupSize?: number
    }

    const admin = gate.admin

    const { candidates, skipped } = await generateIssueCandidates(admin, {
      days: body.days,
      maxCandidates: body.maxCandidates,
      minGroupSize: body.minGroupSize,
    })

    if (candidates.length === 0 && skipped === 0) {
      return NextResponse.json(
        { error: 'LLM 키 없음 또는 태깅 콘텐츠 부족으로 후보 생성 실패' },
        { status: 503 }
      )
    }

    // 살아남은 후보 insert
    let created = 0
    const insertedCandidates: { title: string; theme: string; contentCount: number }[] = []

    for (const candidate of candidates) {
      try {
        const { data: issueRow, error: insertError } = await admin
          .from('issues')
          .insert({
            title: candidate.title,
            summary: candidate.summary,
            status: issueAutoPublish(candidate.content_ids.length) ? 'published' : 'draft',
            match_keywords: candidate.match_keywords,
            source: 'claude',
          })
          .select('id')
          .single()

        if (insertError || !issueRow) {
          console.error('[candidates/generate] 이슈 insert 실패:', insertError?.message)
          continue
        }

        const issueId = (issueRow as { id: string }).id

        // issue_contents 배치 insert
        if (candidate.content_ids.length > 0) {
          const contentRows = candidate.content_ids.map(contentId => ({
            issue_id: issueId,
            content_id: contentId,
            source: 'claude',
          }))

          const { error: contentsError } = await admin
            .from('issue_contents')
            .insert(contentRows)

          if (contentsError) {
            console.error('[candidates/generate] issue_contents insert 실패:', contentsError.message)
          }
        }

        created++
        insertedCandidates.push({
          title: candidate.title,
          theme: candidate.theme,
          contentCount: candidate.content_ids.length,
        })
      } catch (err) {
        console.error('[candidates/generate] 후보 처리 오류:', err instanceof Error ? err.message : String(err))
      }
    }

    return NextResponse.json({ created, skipped, candidates: insertedCandidates })
  } catch (err) {
    console.error('[POST /api/admin/issues/candidates/generate] 오류:', err instanceof Error ? err.message : String(err))
    return NextResponse.json({ error: '서버 오류' }, { status: 500 })
  }
}
