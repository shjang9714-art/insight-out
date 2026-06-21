import type { NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { drainBackfill } from '@/lib/contents/enrich-body'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

/**
 * GET /api/cron/body-backfill
 *
 * Vercel Cron 이 매일 KST 04:00 (UTC 19:00) 에 호출.
 * 270초 시간상자 안에서 body_fetched_at IS NULL 전체를 30건씩 드레인.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return Response.json({ ok: false, error: '인증 실패' }, { status: 401 })
  }

  try {
    const admin = createAdminClient()
    const result = await drainBackfill(admin, {
      limit: 30,
      deadline: Date.now() + 270_000,
    })
    return Response.json({ ok: true, ...result })
  } catch (err) {
    console.error('[크론/body-backfill] 오류:', err)
    const message = err instanceof Error ? err.message : String(err)
    return Response.json(
      { ok: false, error: '본문 백필 중 오류가 발생했습니다.', detail: message },
      { status: 500 }
    )
  }
}
