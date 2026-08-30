import type { SupabaseClient } from '@supabase/supabase-js'
import {
  DEFAULT_MONTHLY_TOKEN_LIMIT,
  monthlyBudget,
} from '@/lib/llm/token-limit'
import { getOpsSettings } from '@/lib/ops/settings'
import { evaluateCronStatus, EXPECTED_CRONS } from '@/lib/jobs/expected-crons'
import { STALE_RUN_REAPED_PREFIX } from '@/lib/jobs/run-job'

interface Signal { fingerprint: string; category: string; severity: 'critical' | 'warning'; title: string; suspected_cause: string; recommended_action: string; impact: string; count: number }

const since24h = () => new Date(Date.now() - 86_400_000).toISOString()

// 523 — 실패 1건만으로 "크론 작업 실패" 신호를 만들면 노이즈다(실측: 24시간 145회 중
// 실패 1건(0.7%)에 긴급 메일이 6명에게 발송됨). 반복성을 확인할 최소 건수부터만 신호를
// 만들고, severity 는 jobKey 문자열(crawl/body 포함 여부)이 아니라 실제 건수·실패율로 정한다.
const CRON_FAIL_MIN_COUNT = 2
const CRON_FAIL_CRITICAL_COUNT = 5
const CRON_FAIL_CRITICAL_RATE = 0.5
const PROVIDER_SILENT_WARNING_HOURS = 48
const PROVIDER_SILENT_CRITICAL_HOURS = 7 * 24

function formatElapsedHours(hours: number): string {
  return hours >= 24 ? `${Math.floor(hours / 24)}일 전` : `${Math.floor(hours)}시간 전`
}

/**
 * 576 — last_error 문자열에서 오류 종류를 읽어 권장 조치를 고른다.
 * ⚠️ 계약: 이 문자열들의 원본은 `src/lib/llm/index.ts:99-105` 다(566에서 정한 철자).
 *    그쪽 문구를 바꾸면 여기도 같이 봐야 한다. 404 는 호출부에서 먼저 분기하므로 여기 없다.
 */
function routeErrorAdvice(lastError: string | null | undefined): string {
  const e = lastError ?? ''
  if (e.includes('(429)')) {
    return '제공사의 무료 쿼터 소진입니다 — 키 문제가 아닙니다. 라우팅 우선순위나 처리량을 조정하세요.'
  }
  if (e.includes('(402')) return '제공사 크레딧이 소진됐습니다. 결제 상태를 확인하세요.'
  if (e.includes('(401') || e.includes('(403')) {
    return '어드민 > 시스템 설정 > AI 모델에서 해당 순위의 키를 점검하고 연동 테스트를 실행하세요.'
  }
  if (e.includes('응답 없음')) {
    return '제공사 응답이 없습니다. 일시 장애일 수 있으니 반복되면 해당 순위를 비활성화하세요.'
  }
  return '어드민 > 시스템 설정 > AI 모델에서 해당 순위의 키·모델을 점검하고 연동 테스트를 실행하세요.'
}

/** "2026-08-12 01:25" 형식(KST) — suspected_cause 문구에 마지막 실행 시각을 박아넣는 용도. */
function formatKst(iso: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(new Date(iso))
  const get = (type: string) => parts.find(p => p.type === type)?.value ?? ''
  return `${get('year')}-${get('month')}-${get('day')} ${get('hour')}:${get('minute')}`
}

/**
 * 497/499 — job_key 별 "가장 최근 실행"(status 무관, skipped 포함) 1건씩.
 *
 * 처음엔 `in(cronKeys)` 로 전체를 한 쿼리로 가져오려 했으나, 로컬 검증 중
 * 실제로 깨지는 걸 확인했다: job_runs 전체(cronKeys 대상만도 4336행)를
 * started_at 내림차순 1000행(API 기본 상한)만 받으면, pg_cron 10분 주기로
 * 도는 body-backfill·ops-alert 의 최근 행이 결과를 채워버려 168시간
 * 주기인 ops-weekly 의 "5일 전 실제 실행" 행이 페이지 밖으로 밀려난다 —
 * 실제로 존재하는 실행 기록을 "실행 기록이 아예 없음"으로 오판했다.
 *
 * 그래서 이 둘만 최신 1행짜리 쿼리로 따로 떼고(EXPECTED_CRONS 의 highFrequency),
 * 나머지는 그중 가장 긴 maxAgeHours 의 critical 임계치(×2)만큼만 시간창을 좁혀
 * 한 쿼리로 가져온다 — 총 쿼리 수는 highFrequency 개수 + 1, 잡 하나당 하나씩 방식이 아니다.
 */
async function fetchCronLastRunAtByKey(admin: SupabaseClient): Promise<Map<string, string>> {
  const highFrequencyKeys = EXPECTED_CRONS.filter(c => c.highFrequency).map(c => c.key)
  const normalCrons = EXPECTED_CRONS.filter(c => !c.highFrequency)
  const maxNormalMaxAgeHours = Math.max(...normalCrons.map(item => item.maxAgeHours))
  const bulkCutoff = new Date(Date.now() - maxNormalMaxAgeHours * 2 * 3_600_000).toISOString()

  const [bulk, ...frequent] = await Promise.all([
    admin.from('job_runs').select('job_key, started_at').in('job_key', normalCrons.map(c => c.key)).gte('started_at', bulkCutoff).order('started_at', { ascending: false }),
    ...highFrequencyKeys.map(key =>
      admin.from('job_runs').select('job_key, started_at').eq('job_key', key).order('started_at', { ascending: false }).limit(1),
    ),
  ])

  const lastRunAtByKey = new Map<string, string>()
  // bulk 는 started_at 내림차순이라 job_key 당 처음 만나는 행이 최신 실행.
  for (const r of bulk.data ?? []) if (!lastRunAtByKey.has(r.job_key)) lastRunAtByKey.set(r.job_key, r.started_at)
  for (const res of frequent) for (const r of res.data ?? []) lastRunAtByKey.set(r.job_key, r.started_at)
  return lastRunAtByKey
}

/** 497/499 구조를 그대로 써서 job_key별 마지막 성공(succeeded/skipped)을 모은다. */
async function fetchCronLastSuccessAtByKey(admin: SupabaseClient): Promise<Map<string, string> | null> {
  const highFrequencyKeys = EXPECTED_CRONS.filter(c => c.highFrequency).map(c => c.key)
  const normalCrons = EXPECTED_CRONS.filter(c => !c.highFrequency)
  const maxNormalMaxAgeHours = Math.max(...normalCrons.map(item => item.maxAgeHours))
  const bulkCutoff = new Date(Date.now() - maxNormalMaxAgeHours * 2 * 3_600_000).toISOString()

  const [bulk, ...frequent] = await Promise.all([
    admin.from('job_runs').select('job_key, started_at').in('job_key', normalCrons.map(c => c.key)).in('status', ['succeeded', 'skipped']).gte('started_at', bulkCutoff).order('started_at', { ascending: false }),
    ...highFrequencyKeys.map(key =>
      admin.from('job_runs').select('job_key, started_at').eq('job_key', key).in('status', ['succeeded', 'skipped']).order('started_at', { ascending: false }).limit(1),
    ),
  ])
  if (bulk.error) {
    console.warn('[운영이슈] 크론 마지막 성공 조회 실패:', bulk.error.message)
    return null
  }
  if ((bulk.data ?? []).length >= 1000) {
    console.warn('[운영이슈] 크론 마지막 성공 조회가 1,000행 상한에 도달했습니다.')
  }

  const lastSuccessAtByKey = new Map<string, string>()
  for (const r of bulk.data ?? []) if (!lastSuccessAtByKey.has(r.job_key)) lastSuccessAtByKey.set(r.job_key, r.started_at)
  for (const res of frequent) for (const r of res.data ?? []) lastSuccessAtByKey.set(r.job_key, r.started_at)
  return lastSuccessAtByKey
}

/**
 * 497/499 — 크론 "부재" 신호. 관측된 job_key 가 아니라 EXPECTED_CRONS(기대 목록,
 * 292 의 단일 진실)를 순회한다 — 없는 것을 찾는 일이므로 있는 것만 봐서는 안 잡힌다.
 * fingerprint 는 `cron:fail:*` 와 겹치지 않는 `cron:absent:*` — 같은 잡이
 * 실패도 하고(24시간 창) 멈추기도(이 함수) 해서 두 신호가 동시에 열릴 수 있다.
 *
 * 판정: 경과 ≤ maxAgeHours → 신호 없음 / maxAgeHours < 경과 ≤ maxAgeHours×2 → warning /
 * 경과 > maxAgeHours×2 → critical / 실행 기록 없음 → critical.
 */
function buildCronAbsenceSignals(lastRunAtByKey: Map<string, string>, now: number): Signal[] {
  const out: Signal[] = []
  for (const { key: jobKey, maxAgeHours } of EXPECTED_CRONS) {
    const lastRunAt = lastRunAtByKey.get(jobKey)
    if (!lastRunAt) {
      out.push({
        fingerprint: `cron:absent:${jobKey}`,
        category: 'cron',
        severity: 'critical',
        title: '크론 실행 기록 없음',
        suspected_cause: `${jobKey} 실행 기록이 아예 없음(허용 ${maxAgeHours}시간)`,
        recommended_action: 'vercel.json crons 등록과 잡 배포 여부를 확인하세요.',
        impact: '자동 운영 작업이 한 번도 실행되지 않음',
        // occurrence_count 는 어드민에 "발생 횟수"로 표시된다 — 실행 기록이
        // 없다는 사실은 count 가 아니라 suspected_cause 문구가 전달하고,
        // 정렬 우선순위는 severity='critical' 이 이미 보장하므로 여기서
        // 실제 데이터가 아닌 값을 count 인 척 박아넣지 않는다.
        count: 0,
      })
      continue
    }
    const evaluation = evaluateCronStatus({ maxAgeHours }, lastRunAt, null, now)
    if (evaluation.tone !== 'stale') continue
    const roundedHours = Math.round(evaluation.lastRunAgeHours ?? 0)
    const severity: Signal['severity'] = evaluation.staleSeverity ?? 'warning'
    out.push({
      fingerprint: `cron:absent:${jobKey}`,
      category: 'cron',
      severity,
      title: '크론 실행 부재',
      suspected_cause: `${jobKey} — ${formatKst(lastRunAt)} 이후 ${roundedHours}시간 무실행, 허용 ${maxAgeHours}시간`,
      recommended_action: 'Vercel 크론 로그와 job_runs 최근 기록을 확인하세요.',
      impact: '자동 운영 작업이 멈춘 상태일 수 있음',
      count: roundedHours,
    })
  }
  return out
}

function buildCronFailingSignals(
  lastRunAtByKey: Map<string, string>,
  lastSuccessAtByKey: Awaited<ReturnType<typeof fetchCronLastSuccessAtByKey>>,
  now: number,
): Signal[] {
  if (!lastSuccessAtByKey) return []
  const out: Signal[] = []
  for (const { key: jobKey, maxAgeHours } of EXPECTED_CRONS) {
    const lastRunAt = lastRunAtByKey.get(jobKey) ?? null
    const lastSuccessAt = lastSuccessAtByKey.get(jobKey) ?? null
    const evaluation = evaluateCronStatus({ maxAgeHours }, lastRunAt, lastSuccessAt, now)
    if (evaluation.tone !== 'failing' || !evaluation.failingSeverity) continue

    const roundedHours = Math.round(evaluation.lastSuccessAgeHours ?? maxAgeHours * 2)
    const successDescription = lastSuccessAt
      ? `${formatKst(lastSuccessAt)} 이후 ${roundedHours}시간 경과`
      : `마지막 성공 기록 없음(최소 ${roundedHours}시간 경과로 판정)`
    out.push({
      fingerprint: `cron:failing:${jobKey}`,
      category: 'cron',
      severity: evaluation.failingSeverity,
      title: '크론 연속 실패',
      suspected_cause: `${jobKey} — ${successDescription}, 허용 ${maxAgeHours}시간`,
      recommended_action: 'job_runs 최근 실행의 error 컬럼을 확인하세요.',
      impact: '크론은 실행되지만 성공하지 못해 후속 데이터가 갱신되지 않음',
      count: roundedHours,
    })
  }
  return out
}

export async function detectOpsIssues(admin: SupabaseClient): Promise<{ open: number; resolved: number }> {
  const since = since24h()
  const signals: Signal[] = []
  const opsSettings = await getOpsSettings()
  const [jobs, crawls, backlog, usage, lifetimeUsage, settings, translation, tts, routingModelErrors, primaryRoutes, lastRunAtByKey, lastSuccessAtByKey] = await Promise.all([
    admin.from('job_runs').select('job_key, error').eq('status', 'failed').gte('started_at', since),
    admin.from('crawl_logs').select('source_id, status').in('status', ['failed', 'partial']).gte('started_at', since),
    admin.from('contents').select('id', { count: 'exact', head: true }).eq('status', 'pending').is('body_fetched_at', null).is('deleted_at', null),
    admin.from('llm_usage').select('provider, tokens').eq('period', new Date().toISOString().slice(0, 7)),
    // 예산은 이번 달, 마지막 성공은 월 경계와 무관하게 전체 기간을 본다.
    admin.from('llm_usage').select('provider, updated_at'),
    admin.from('llm_settings').select('provider, enabled, monthly_token_limit'),
    admin.from('translation_usage').select('chars').eq('period', new Date().toISOString().slice(0, 7)),
    admin.from('tts_usage').select('chars').eq('period', new Date().toISOString().slice(0, 7)),
    admin
      .from('llm_task_routing')
      .select('task_type, priority, provider, model_id, last_error')
      .eq('is_active', true)
      .gte('last_error_at', since),
    admin
      .from('llm_task_routing')
      .select('task_type, provider')
      .eq('is_active', true)
      .eq('priority', 1)
      .order('task_type'),
    fetchCronLastRunAtByKey(admin),
    fetchCronLastSuccessAtByKey(admin),
  ])
  // 523-B — Vercel maxDuration 하드킬을 reapStaleRunningJobs 가 failed 로 마감한 행은
  // 잡 오류가 아니라 실행시간 초과다(원인·조치가 다름) — error 접두사로 분리해 별도 신호로 낸다.
  // error 가 null 이면 실제 예외로 센다(보수적: 하드킬이 아니라고 확신할 수 없는 쪽은 실제 예외로).
  const realFailCounts = new Map<string, number>()
  const hardkillCounts = new Map<string, number>()
  for (const r of jobs.data ?? []) {
    const isHardkill = typeof r.error === 'string' && r.error.startsWith(STALE_RUN_REAPED_PREFIX)
    const target = isHardkill ? hardkillCounts : realFailCounts
    target.set(r.job_key, (target.get(r.job_key) ?? 0) + 1)
  }
  // 실패(예외+하드킬) 한 job_key 만 대상으로 전체 실행 건수를 서버에서 집계한다(행 전송 없음, 상한 없음).
  // 전체 행을 select 하면 PostgREST 기본 1000행 상한에 잘려 total 이 과소 집계되고,
  // 실패율이 부풀려져 오히려 없던 critical 이 생긴다 — 523이 없애려던 바로 그 노이즈.
  const failedJobKeys = new Set<string>([...realFailCounts.keys(), ...hardkillCounts.keys()])
  const jobTotalCounts = new Map<string, number>()
  await Promise.all([...failedJobKeys].map(async (jobKey) => {
    const { count, error } = await admin
      .from('job_runs')
      .select('id', { count: 'exact', head: true })
      .eq('job_key', jobKey)
      .gte('started_at', since)
    if (!error && typeof count === 'number') jobTotalCounts.set(jobKey, count)
  }))
  for (const [jobKey, count] of realFailCounts) {
    if (count < CRON_FAIL_MIN_COUNT) continue
    const total = jobTotalCounts.get(jobKey) ?? null
    const failureRate = total && total > 0 ? count / total : null
    const severity: Signal['severity'] =
      count >= CRON_FAIL_CRITICAL_COUNT || (failureRate !== null && failureRate >= CRON_FAIL_CRITICAL_RATE)
        ? 'critical' : 'warning'
    const suspected_cause = failureRate !== null
      ? `${jobKey} — 최근 24시간 ${total}회 중 ${count}회 실패(실패율 ${Math.round(failureRate * 100)}%)`
      : `${jobKey} — 최근 24시간 ${count}회 실패(전체 실행 건수 집계 실패)`
    signals.push({
      fingerprint: `cron:fail:${jobKey}`,
      category: 'cron',
      severity,
      title: '크론 작업 실패',
      suspected_cause,
      recommended_action: '잡 실행 로그와 환경변수를 확인하세요.',
      impact: '자동 운영 작업 지연',
      count,
    })
  }
  // 하드킬은 만성 용량 문제(배치 크기·소프트 데드라인)라 하루 몇 건이 정상 범위다 —
  // CRON_FAIL_CRITICAL_COUNT(절대건수) 규칙은 적용하지 않는다. 그 규칙을 적용하면
  // 523이 없앤 노이즈가 이름만 바꿔 돌아온다.
  for (const [jobKey, n] of hardkillCounts) {
    if (n < CRON_FAIL_MIN_COUNT) continue
    const total = jobTotalCounts.get(jobKey) ?? null
    const failureRate = total && total > 0 ? n / total : null
    const severity: Signal['severity'] = failureRate !== null && failureRate >= CRON_FAIL_CRITICAL_RATE ? 'critical' : 'warning'
    const suspected_cause = failureRate !== null
      ? `${jobKey} — 최근 24시간 ${total}회 중 ${n}회가 실행시간 초과로 강제 종료(리퍼 마감)`
      : `${jobKey} — 최근 24시간 ${n}회가 실행시간 초과로 강제 종료(리퍼 마감, 전체 실행 건수 집계 실패)`
    signals.push({
      fingerprint: `cron:hardkill:${jobKey}`,
      category: 'cron',
      severity,
      title: '크론 실행시간 초과',
      suspected_cause,
      recommended_action: 'maxDuration·소프트 데드라인·1회 처리량 배분을 확인하세요. 잡 오류가 아니라 시간 초과입니다.',
      impact: '작업이 매번 중간에서 잘림',
      count: n,
    })
  }
  const crawlCounts = new Map<string, number>(); for (const r of crawls.data ?? []) if (r.source_id) crawlCounts.set(r.source_id, (crawlCounts.get(r.source_id) ?? 0) + 1)
  for (const [sourceId, count] of crawlCounts) signals.push({ fingerprint: `crawl:fail:${sourceId}`, category: 'crawl', severity: 'warning', title: '수집 소스 오류 반복', suspected_cause: '해당 소스 응답 또는 파서 지연 추정', recommended_action: '실패 로그를 확인하고 소스를 일시 중지하세요.', impact: '콘텐츠 수집 누락', count })
  const disabledProviders = new Set((settings.data ?? []).filter(s => !s.enabled).map(s => s.provider))
  // 576 — enabled 로 거르면 비활성 provider 가 맵에서 빠져 monthlyBudget(undefined) →
  // DEFAULT_MONTHLY_TOKEN_LIMIT(100만) 이 분모가 된다. cerebras 는 실제 예산이 2,000만인데
  // 24.4% 가 489% 로 찍혔다. 맵은 전체를 담고, 경보 제외는 아래 continue 분기에서 한다.
  const settingsMap = new Map((settings.data ?? []).map(s => [s.provider, Number(s.monthly_token_limit ?? DEFAULT_MONTHLY_TOKEN_LIMIT)]))
  const usedMap = new Map<string, number>(); for (const r of usage.data ?? []) usedMap.set(r.provider, (usedMap.get(r.provider) ?? 0) + Number(r.tokens ?? 0))
  for (const [provider, used] of usedMap) {
    // 576 — 비활성 provider 는 라우팅에서 빠져 있어 사용량이 늘 수 없다. 조치할 게 없는 경보다.
    if (disabledProviders.has(provider)) continue
    const limit = monthlyBudget(settingsMap.get(provider))
    // limit 은 항상 양수(DEFAULT_MONTHLY_TOKEN_LIMIT 이하로 떨어지지 않음)이지만 0 나눗셈 방어로 남겨둔다.
    const percent = limit > 0 ? used / limit * 100 : 0
    if (percent >= 80) {
      signals.push({
        fingerprint: `usage:limit:${provider}`,
        category: 'usage',
        severity: percent >= 95 ? 'critical' : 'warning',
        title: 'AI 사용 예산 초과 임박',
        suspected_cause: `${provider} 월 사용량 ${used.toLocaleString()} / 예산 ${limit.toLocaleString()} 토큰 (${Math.round(percent)}%)`,
        recommended_action: '자체 월 예산(llm_settings.monthly_token_limit) 기준입니다. 제공사 쿼터가 아닙니다. 예산 조정 또는 라우팅 우선순위를 검토하세요.',
        impact: '예산 초과 시 해당 provider가 라우팅에서 제외됩니다.',
        count: 1,
      })
    }
  }
  const caps = [{ key: 'translation', used: (translation.data ?? []).reduce((n, r) => n + Number(r.chars ?? 0), 0), cap: Number(opsSettings.translation_monthly_char_cap) }, { key: 'tts', used: (tts.data ?? []).reduce((n, r) => n + Number(r.chars ?? 0), 0), cap: Number(opsSettings.tts_monthly_char_cap) }]
  // 한도를 못 읽었거나(0·NaN) 비정상이면 그 신호는 건너뛴다 — 0 으로 나누면 즉시 오탐한다.
  for (const c of caps) if (Number.isFinite(c.cap) && c.cap > 0 && c.used / c.cap >= 0.8) signals.push({ fingerprint: `usage:limit:${c.key}`, category: 'usage', severity: c.used / c.cap >= 0.95 ? 'critical' : 'warning', title: `${c.key === 'tts' ? 'TTS' : '번역'} 사용량 한도 임박`, suspected_cause: `월 사용량이 ${Math.round(c.used / c.cap * 100)}%에 도달`, recommended_action: '월 한도와 사용 추세를 확인하세요.', impact: '해당 기능 중단 가능성', count: 1 })
  if ((backlog.count ?? 0) > 100) signals.push({ fingerprint: 'enrichment:backlog', category: 'enrichment', severity: 'warning', title: '본문 보강 지연', suspected_cause: '원문 서버 응답 지연 추정', recommended_action: '실패 로그 확인 또는 해당 소스를 일시 중지하세요.', impact: `대기 콘텐츠 ${backlog.count ?? 0}건`, count: backlog.count ?? 0 })
  if (routingModelErrors.error) {
    console.error('[운영이슈] LLM 라우팅 모델 오류 조회 실패:', routingModelErrors.error.message)
  }
  for (const route of routingModelErrors.data ?? []) {
    // 576 — is_active 는 "경로"의 활성이지 "provider"의 활성이 아니다.
    // 비활성 provider 를 가리키는 활성 경로가 실측 6건 있고, 그 오류가 그대로 경보가 된다.
    if (disabledProviders.has(route.provider)) continue
    if (route.last_error?.includes('모델 사용 불가(404)')) {
      signals.push({
        fingerprint: `llm:model_unavailable:${route.task_type}:${route.priority}`,
        category: 'usage',
        severity: 'warning',
        title: 'LLM 라우팅 모델 사용 불가',
        suspected_cause: `${route.provider}/${route.model_id} 가 404 를 반환 — 모델이 은퇴했거나 유료로 전환됨`,
        recommended_action: '어드민 > 시스템 설정 > AI 모델에서 해당 순위의 모델을 교체하세요.',
        impact: `${route.task_type} 작업이 해당 순위를 건너뜀`,
        count: 1,
      })
      continue
    }
    signals.push({
      fingerprint: `llm:route_error:${route.task_type}:${route.priority}`,
      category: 'usage',
      severity: 'warning',
      title: 'LLM 라우팅 오류',
      // 576 — 같은 문장이 4줄 반복되던 원인: 어느 작업의 몇 순위인지가 impact 에만 있었다.
      suspected_cause: `${route.task_type} ${route.priority}순위 — ${route.last_error ?? '오류 상세 없음'}`,
      recommended_action: routeErrorAdvice(route.last_error),
      impact: `${route.task_type} 작업이 해당 순위를 건너뜀`,
      count: 1,
    })
  }

  const lastSuccessAtByProvider = new Map<string, string>()
  for (const row of lifetimeUsage.data ?? []) {
    if (!row.updated_at) continue
    const current = lastSuccessAtByProvider.get(row.provider)
    if (!current || row.updated_at > current) lastSuccessAtByProvider.set(row.provider, row.updated_at)
  }
  const primaryTasksByProvider = new Map<string, string[]>()
  for (const route of primaryRoutes.data ?? []) {
    const tasks = primaryTasksByProvider.get(route.provider) ?? []
    tasks.push(route.task_type)
    primaryTasksByProvider.set(route.provider, tasks)
  }
  for (const [provider, tasks] of primaryTasksByProvider) {
    if (disabledProviders.has(provider)) continue
    const lastSuccessAt = lastSuccessAtByProvider.get(provider)
    if (!lastSuccessAt) continue
    const elapsedHours = (Date.now() - new Date(lastSuccessAt).getTime()) / 3_600_000
    if (elapsedHours <= PROVIDER_SILENT_WARNING_HOURS) continue
    signals.push({
      fingerprint: `llm:provider_silent:${provider}`,
      category: 'usage',
      severity: elapsedHours > PROVIDER_SILENT_CRITICAL_HOURS ? 'critical' : 'warning',
      title: 'LLM 제공자 무응답',
      suspected_cause: `${provider} 마지막 성공 ${formatElapsedHours(elapsedHours)} — ${tasks.join('·')} 1순위`,
      recommended_action: '어드민 > 시스템 설정 > AI 모델에서 키·모델을 점검하고 연동 테스트를 실행하세요.',
      impact: '하위 순위로 폴백 중이며 해당 순위 제공자의 예산이 빠르게 소진될 수 있습니다.',
      count: Math.floor(elapsedHours),
    })
  }

  signals.push(...buildCronAbsenceSignals(lastRunAtByKey, Date.now()))
  signals.push(...buildCronFailingSignals(lastRunAtByKey, lastSuccessAtByKey, Date.now()))

  const { data: existing } = await admin.from('ops_issues').select('fingerprint, status').in('status', ['open', 'resolved', 'acknowledged', 'in_progress', 'ignored'])
  const seen = new Set(signals.map(s => s.fingerprint)); let resolved = 0
  for (const signal of signals) {
    const prior = (existing ?? []).find(row => row.fingerprint === signal.fingerprint)
    // ops_issues 에는 count 컬럼이 없다(occurrence_count 만 있음, 429 스키마) —
    // signal.count 를 그대로 스프레드하면 PostgREST 가 "Could not find the
    // 'count' column" 으로 upsert 를 통째로 실패시킨다(497 검증 중 발견,
    // 이 루프 자체의 기존 버그 — 모든 신호 종류에 적용되던 문제라 같이 고친다).
    const { count, ...signalColumns } = signal
    const update = { ...signalColumns, occurrence_count: count, last_seen_at: new Date().toISOString(), ...(prior?.status === 'resolved' || !prior ? { status: 'open', resolved_at: null, alerted_at: null } : {}) }
    const { error } = await admin.from('ops_issues').upsert(update, { onConflict: 'fingerprint' })
    if (error) console.error('[운영이슈] upsert 실패:', error.message)
  }
  for (const issue of existing ?? []) if (!seen.has(issue.fingerprint) && issue.status === 'open') {
    const { error } = await admin.from('ops_issues').update({ status: 'resolved', resolved_at: new Date().toISOString() }).eq('fingerprint', issue.fingerprint).eq('status', 'open')
    if (!error) resolved++
  }
  const { count: open } = await admin.from('ops_issues').select('id', { count: 'exact', head: true }).in('status', ['open', 'acknowledged', 'in_progress'])
  return { open: open ?? 0, resolved }
}
