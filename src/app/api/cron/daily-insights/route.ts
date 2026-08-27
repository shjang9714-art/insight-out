import type { NextRequest } from 'next/server'
import { generateDailyInsightBatch } from '@/lib/daily-insights/generate'
import { createAdminClient } from '@/lib/supabase/admin'
import { runJob } from '@/lib/jobs/run-job'
import { getKstDateParts } from '@/lib/date'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
// 그룹(최대 10개)당 순차 LLM 호출 — completeWithRetry 재시도·provider 폴백 캐스케이드가
// 그룹마다 겹치면 시간이 걸릴 수 있어 key-insights 크론과 동일하게 300초로 확보.
export const maxDuration = 300

/**
 * 핵심 Insight 주간 종합 인사이트(지시서 20260715, 매일→매주 복귀) — vercel.json 크론 항목은
 * 여전히 매일 실행되지만(Vercel Hobby 요일제약 회피), 이 라우트가 KST 월~수가 아니면 즉시
 * skip한다. 화·수 허용은 캐치업 재시도용(지시서 20260827c) — 월요일 실행이 maxDuration 초과로
 * 하드킬돼도 다음날 자동 재시도된다. week_of 는 항상 "직전 완결 주"로 계산되므로(generate.ts
 * getLastCompletedWeekKst) 화·수에 돌아도 월요일과 같은 week_of 를 만들고, 월요일에 이미
 * 성공했으면 그 week_of 멱등 체크가 캐치업 실행을 skip 시킨다(중복 생성 없음).
 * 목~일은 여전히 skip — job_runs 오탐 방지 게이트(§아래)는 그대로 유지.
 *
 * 500 — 요일 게이트는 반드시 runJob 콜백 "안"에서 판정한다. runJob 보다 앞에서 조기
 * return 하면 월요일이 아닌 6일간 job_runs 에 행이 아예 안 생겨, "게이트로 안 돈 것"과
 * "크론 호출 자체가 안 온 것(진짜 장애)"이 둘 다 무기록으로 구분 불가능해진다 — 실제로
 * cron:absent:cron:daily-insights 가 86시간 무실행 critical 오탐으로 떴었다. maxAgeHours 를
 * 늘리는 건 오탐만 없앨 뿐 진짜 장애 감지를 8일까지 늦추는 잘못된 처방이다(경쟁사 주간
 * 크론(competitor-weekly)이 이미 이 형태로 매일 skipped 행을 남긴다 — 그 패턴을 따른다).
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return Response.json({ ok: false, error: '인증 실패' }, { status: 401 })
  }

  // ?force=1 — 어드민 수동 트리거(백필·최초 배치 검증용). CRON_SECRET 인증은 그대로 필요,
  // 요일 게이트만 우회. week_of 멱등 체크는 generateDailyInsightBatch 내부에서 계속 적용된다.
  // ?preview=1 — 멱등 체크·DB insert 없이 로직만 검증(이미 이번 주 배치가 있어도 동작).
  // job_runs 에 기록이 남으면 안 되는 경로라 runJob 밖에서 처리한다(요일 게이트 우회 조건에도
  // 포함하지 않음 — preview 는 아래 게이트 판정 블록에 도달하지 않고 여기서 바로 반환된다).
  const isForced = request.nextUrl.searchParams.get('force') === '1'
  const isPreview = request.nextUrl.searchParams.get('preview') === '1'

  try {
    if (isPreview) {
      const result = await generateDailyInsightBatch({ dryRun: true })
      return Response.json(result)
    }
    const admin = createAdminClient()
    const result = await runJob(admin, { key: 'cron:daily-insights', trigger: 'cron' }, async () => {
      const { weekday } = getKstDateParts(new Date())
      // 월(1)~수(3) 허용 — 화·수는 월요일 실패(하드킬 등) 캐치업 재시도용. week_of 멱등
      // 체크가 중복 생성을 막는다(위 JSDoc 참고). 목~일은 계속 skip.
      const isCatchupWindow = weekday === 1 || weekday === 2 || weekday === 3
      if (!isCatchupWindow && !isForced) {
        return { ok: true, generated: 0, skipped: 'not_scheduled', weekday }
      }
      return generateDailyInsightBatch()
    })
    return Response.json(result)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[크론/daily-insights] ${new Date().toISOString()} 생성 오류:`, message)
    return Response.json(
      {
        ok: false,
        generated: 0,
        skipped: false,
        failed: true,
        errorReason: message,
        error: '일일 핵심 Insight 생성 중 오류가 발생했습니다.',
        detail: message,
      },
      { status: 500 }
    )
  }
}
