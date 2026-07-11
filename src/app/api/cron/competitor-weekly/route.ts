import type { NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { LLM_PROVIDERS } from '@/lib/llm'
import { generateCompetitorWeeklyReport, getLastCompletedWeekKst } from '@/lib/competitor-weekly/generate'
import { getCompetitorWeeklySettings } from '@/lib/competitor-weekly/settings'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

/**
 * GET /api/cron/competitor-weekly
 *
 * Vercel Cron 스케줄은 vercel.json 에 배포시점으로 고정되어 런타임에 바꿀 수 없다.
 * 그래서 매시(0 * * * *) 호출되지만, 이 라우트가 어드민 설정(competitor_weekly_settings)의
 * 요일·시각(KST)과 지금이 일치하는지 게이트한 뒤에만 실제로 생성한다(284).
 * 대상 주(week_start)가 이미 있으면 스킵(멱등 — 매시 실행 대비).
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return Response.json({ ok: false, error: '인증 실패' }, { status: 401 })
  }

  if (!LLM_PROVIDERS.some(p => p.isConfigured())) {
    return Response.json({ ok: true, skipped: 'llm_not_configured' })
  }

  try {
    const admin = createAdminClient()

    // ── 1. 설정 조회(테이블 미적용 시 기본값 — 기존 동작과 동일: 월 06시 KST) ──
    const { settings } = await getCompetitorWeeklySettings(admin)

    if (!settings.enabled) {
      return Response.json({ ok: true, skipped: 'disabled' })
    }

    // ── 2. 현재 KST 요일·시각이 설정과 일치하는지 게이트 ──
    // Asia/Seoul 은 DST 없이 고정 +9라 아래 계산으로 충분(월 06시 KST = 구 "0 21 * * 0" UTC 검산됨).
    const nowKst = new Date(Date.now() + 9 * 60 * 60 * 1000)
    const dow = nowKst.getUTCDay()
    const hour = nowKst.getUTCHours()
    if (dow !== settings.generate_dow || hour !== settings.generate_hour) {
      return Response.json({ ok: true, skipped: 'not_scheduled', dow, hour })
    }

    // ── 3. 멱등 가드 — 대상 주 리포트가 이미 있으면 재생성하지 않는다 ──
    const { weekStart } = getLastCompletedWeekKst()
    const { data: existing, error: existingError } = await admin
      .from('competitor_weekly_reports')
      .select('id')
      .eq('week_start', weekStart)
      .maybeSingle()
    if (existingError && existingError.code !== '42P01') {
      console.error('[크론/competitor-weekly] 기존 리포트 확인 실패:', existingError.message)
    }
    if (existing) {
      return Response.json({ ok: true, skipped: 'already_exists', weekStart })
    }

    // ── 4. 생성 — auto_publish=false 면 애초에 draft 로 저장(published 창 없음, 284 재현검증 수정) ──
    const deadline = Date.now() + 270_000
    const result = await generateCompetitorWeeklyReport(admin, { deadline, publish: settings.auto_publish })

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
