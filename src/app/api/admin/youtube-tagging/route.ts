import { verifyAdminRequest } from '@/lib/admin/verify-admin-request'
import { NextRequest, NextResponse } from 'next/server'
import { backfillYoutubeTagging } from '@/lib/insight/youtube-tagging-backfill'
import { runJob } from '@/lib/jobs/run-job'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'


/**
 * POST /api/admin/youtube-tagging
 * body: { max?: number (기본 100, 상한 300) }
 * 기존 유튜브 콘텐츠 분류(matched_groups/keywords)·엔티티 태깅 백필 트리거(252)
 */
export async function POST(request: NextRequest) {
  try {
    const gate = await verifyAdminRequest()
    if (!gate.ok) return gate.response

    let max = 100
    try {
      const body = await request.json() as Record<string, unknown>
      if (typeof body.max === 'number' && body.max > 0) max = Math.min(body.max, 300)
    } catch { /* body 파싱 실패 시 기본값 사용 */ }

    const supabase = gate.admin
    const result = await runJob(supabase, { key: 'admin:youtube-tagging', trigger: 'admin', startedBy: gate.userId }, () =>
      backfillYoutubeTagging(supabase, { max })
    )
    return NextResponse.json(result)
  } catch (err) {
    console.error('[youtube-tagging backfill]', err)
    return NextResponse.json({ error: '유튜브 태깅 백필 중 오류가 발생했습니다.' }, { status: 500 })
  }
}
