import type { NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { runJob } from '@/lib/jobs/run-job'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return Response.json({ ok: false, error: '인증 실패' }, { status: 401 })
  }

  const admin = createAdminClient()
  const result = await runJob(admin, { key: 'cron:entity-metrics-refresh', trigger: 'cron' }, async () => {
    const steps = [
      { label: '엔티티 언급 수', rpc: 'refresh_entity_mention_counts', key: 'updated' },
      // 578 — 관계지도 lift 엣지의 원천. 실시간 계산은 2.77초라 매트뷰로 내렸다.
      // 비동시 갱신이 ~3초간 ACCESS EXCLUSIVE 락을 잡는다 — KST 05:50 이라 수용한다.
      { label: '엔티티 쌍 통계', rpc: 'refresh_entity_pair_stats', key: 'pairs' },
      // 588 — 이슈 활동도(30일 창) 집계. 라이브 계산은 8.3초라 매트뷰로 내렸다.
      //   authenticator의 statement_timeout 8초를 넘어 08-28~30 매일 실패했고, N-6-A가 함수 단위 timeout으로 해소했다.
      //   top_keywords 의 unnest 가 124만 행으로 불어나는 게 원인이다.
      //   비동시 갱신이 ~8초간 락을 잡는다 — KST 05:50 이라 수용한다.
      { label: '이슈 활동도', rpc: 'refresh_issue_activity_stats', key: 'issueStats' },
      // 590-C — 어드민 키워드 자동완성 후보. 전량 집계가 3.3초라 매트뷰로 내렸다.
      { label: '키워드 후보', rpc: 'refresh_keyword_suggestion_stats', key: 'keywordStats' },
    ] as const
    const values: Record<(typeof steps)[number]['key'], number | null> = {
      updated: null,
      pairs: null,
      issueStats: null,
      keywordStats: null,
    }
    const errors: string[] = []

    for (const step of steps) {
      try {
        const { data, error } = await admin.rpc(step.rpc)
        if (error) {
          errors.push(`${step.label}: ${error.message}`)
          continue
        }

        const value = Number(data)
        if (!Number.isFinite(value)) {
          errors.push(`${step.label}: 갱신 결과가 숫자가 아닙니다.`)
          continue
        }
        values[step.key] = value
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        errors.push(`${step.label}: ${message}`)
      }
    }

    return {
      ok: errors.length === 0,
      ...values,
      ...(errors.length ? { error: errors.join(' | ') } : {}),
    }
  })
  if (result.ok === false) {
    return Response.json(result, { status: 500 })
  }
  return Response.json(result)
}
