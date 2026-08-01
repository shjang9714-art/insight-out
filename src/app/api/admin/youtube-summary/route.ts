import { verifyAdminRequest } from '@/lib/admin/verify-admin-request'
import { NextRequest, NextResponse } from 'next/server'
import { backfillYoutubeSummary } from '@/lib/insight/youtube-summary-backfill'
import { runJob } from '@/lib/jobs/run-job'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'


/**
 * POST /api/admin/youtube-summary
 * body: { max?: number (기본 50, 상한 200) }
 * summary_ko 없는 유튜브 콘텐츠에 제목+채널명 기반 요약 백필 트리거(266)
 */
export async function POST(request: NextRequest) {
  try {
    const gate = await verifyAdminRequest()
    if (!gate.ok) return gate.response

    let max = 50
    try {
      const body = await request.json() as Record<string, unknown>
      if (typeof body.max === 'number' && body.max > 0) max = Math.min(body.max, 200)
    } catch { /* body 파싱 실패 시 기본값 사용 */ }

    const supabase = gate.admin
    const result = await runJob(supabase, { key: 'admin:youtube-summary', trigger: 'admin', startedBy: gate.userId }, () =>
      backfillYoutubeSummary(supabase, { max })
    )
    return NextResponse.json(result)
  } catch (err) {
    console.error('[youtube-summary backfill]', err)
    return NextResponse.json({ error: '유튜브 요약 생성 중 오류가 발생했습니다.' }, { status: 500 })
  }
}
