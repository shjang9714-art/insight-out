import type { NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { LLM_PROVIDERS } from '@/lib/llm'
import { generateCompetitorWeeklyReport } from '@/lib/competitor-weekly/generate'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

/**
 * GET /api/cron/competitor-weekly
 *
 * Vercel Cron 이 매주 일요일 21:00 UTC(월요일 06:00 KST)에 호출 — 방금 끝난
 * 한 주(월~일)의 경쟁사 동향을 사업영역별로 종합해 competitor_weekly_reports 에 적재(261).
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return Response.json({ ok: false, error: '인증 실패' }, { status: 401 })
  }

  if (!LLM_PROVIDERS.some(p => p.isConfigured())) {
    return Response.json({ ok: true, skipped: true, reason: 'LLM 키 없음' })
  }

  try {
    const admin = createAdminClient()
    const deadline = Date.now() + 270_000
    const result = await generateCompetitorWeeklyReport(admin, { deadline })
    console.log('[크론/competitor-weekly] 완료:', JSON.stringify(result))
    return Response.json({ ok: true, ...result })
  } catch (err) {
    console.error('[크론/competitor-weekly] 오류:', err)
    const message = err instanceof Error ? err.message : String(err)
    return Response.json(
      { ok: false, error: '주간 경쟁 리포트 생성 중 오류가 발생했습니다.', detail: message },
      { status: 500 }
    )
  }
}
