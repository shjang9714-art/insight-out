import type { SupabaseClient } from '@supabase/supabase-js'
import { getProviderKeyCount } from '@/lib/llm/provider-key-count'
import { LLM_PROVIDERS } from '@/lib/llm'
import {
  DEFAULT_MONTHLY_TOKEN_LIMIT,
  effectiveTokenLimit,
} from '@/lib/llm/token-limit'
import { getOpsSettings } from '@/lib/ops/settings'
import { EXPECTED_CRONS } from '@/lib/jobs/expected-crons'

interface Signal { fingerprint: string; category: string; severity: 'critical' | 'warning'; title: string; suspected_cause: string; recommended_action: string; impact: string; count: number }

const since24h = () => new Date(Date.now() - 86_400_000).toISOString()

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
  const maxNormalMaxAgeHours = Math.max(...normalCrons.map(c => c.maxAgeHours))
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
    const elapsedHours = (now - new Date(lastRunAt).getTime()) / 3_600_000
    if (elapsedHours <= maxAgeHours) continue
    const severity: Signal['severity'] = elapsedHours > maxAgeHours * 2 ? 'critical' : 'warning'
    const roundedHours = Math.round(elapsedHours)
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

export async function detectOpsIssues(admin: SupabaseClient): Promise<{ open: number; resolved: number }> {
  const since = since24h()
  const signals: Signal[] = []
  const opsSettings = await getOpsSettings()
  const [jobs, crawls, backlog, usage, settings, translation, tts, routingModelErrors, lastRunAtByKey] = await Promise.all([
    admin.from('job_runs').select('job_key').eq('status', 'failed').gte('started_at', since),
    admin.from('crawl_logs').select('source_id, status').in('status', ['failed', 'partial']).gte('started_at', since),
    admin.from('contents').select('id', { count: 'exact', head: true }).eq('status', 'pending').is('body_fetched_at', null).is('deleted_at', null),
    admin.from('llm_usage').select('provider, tokens').eq('period', new Date().toISOString().slice(0, 7)),
    admin.from('llm_settings').select('provider, monthly_token_limit').eq('enabled', true),
    admin.from('translation_usage').select('chars').eq('period', new Date().toISOString().slice(0, 7)),
    admin.from('tts_usage').select('chars').eq('period', new Date().toISOString().slice(0, 7)),
    admin
      .from('llm_task_routing')
      .select('task_type, priority, provider, model_id')
      .eq('is_active', true)
      .gte('last_error_at', since),
    fetchCronLastRunAtByKey(admin),
  ])
  const jobCounts = new Map<string, number>(); for (const r of jobs.data ?? []) jobCounts.set(r.job_key, (jobCounts.get(r.job_key) ?? 0) + 1)
  for (const [jobKey, count] of jobCounts) signals.push({ fingerprint: `cron:fail:${jobKey}`, category: 'cron', severity: jobKey.includes('crawl') || jobKey.includes('body') ? 'critical' : 'warning', title: '크론 작업 실패', suspected_cause: `${jobKey} 작업 오류가 반복되는 상태`, recommended_action: '잡 실행 로그와 환경변수를 확인하세요.', impact: '자동 운영 작업 지연', count })
  const crawlCounts = new Map<string, number>(); for (const r of crawls.data ?? []) if (r.source_id) crawlCounts.set(r.source_id, (crawlCounts.get(r.source_id) ?? 0) + 1)
  for (const [sourceId, count] of crawlCounts) signals.push({ fingerprint: `crawl:fail:${sourceId}`, category: 'crawl', severity: 'warning', title: '수집 소스 오류 반복', suspected_cause: '해당 소스 응답 또는 파서 지연 추정', recommended_action: '실패 로그를 확인하고 소스를 일시 중지하세요.', impact: '콘텐츠 수집 누락', count })
  const settingsMap = new Map((settings.data ?? []).map(s => [s.provider, Number(s.monthly_token_limit ?? DEFAULT_MONTHLY_TOKEN_LIMIT)]))
  const usedMap = new Map<string, number>(); for (const r of usage.data ?? []) usedMap.set(r.provider, (usedMap.get(r.provider) ?? 0) + Number(r.tokens ?? 0))
  for (const [provider, used] of usedMap) {
    const p = LLM_PROVIDERS.find(v => v.name === provider); const keyCount = p ? getProviderKeyCount(p) : 0; const limit = effectiveTokenLimit(settingsMap.get(provider), keyCount)
    // 키 제거 직후 남은 사용 기록은 무해하므로 한도 0은 사용량 신호에서 제외한다.
    const percent = limit > 0 ? used / limit * 100 : 0
    if (percent >= 80) signals.push({ fingerprint: `usage:limit:${provider}`, category: 'usage', severity: percent >= 95 ? 'critical' : 'warning', title: 'AI 사용량 한도 임박', suspected_cause: `${provider} 월 사용량이 ${Math.round(percent)}%에 도달`, recommended_action: '키 수와 월 한도를 확인하고 사용량을 조정하세요.', impact: 'AI 작업 중단 가능성', count: 1 })
  }
  const caps = [{ key: 'translation', used: (translation.data ?? []).reduce((n, r) => n + Number(r.chars ?? 0), 0), cap: Number(opsSettings.translation_monthly_char_cap) }, { key: 'tts', used: (tts.data ?? []).reduce((n, r) => n + Number(r.chars ?? 0), 0), cap: Number(opsSettings.tts_monthly_char_cap) }]
  // 한도를 못 읽었거나(0·NaN) 비정상이면 그 신호는 건너뛴다 — 0 으로 나누면 즉시 오탐한다.
  for (const c of caps) if (Number.isFinite(c.cap) && c.cap > 0 && c.used / c.cap >= 0.8) signals.push({ fingerprint: `usage:limit:${c.key}`, category: 'usage', severity: c.used / c.cap >= 0.95 ? 'critical' : 'warning', title: `${c.key === 'tts' ? 'TTS' : '번역'} 사용량 한도 임박`, suspected_cause: `월 사용량이 ${Math.round(c.used / c.cap * 100)}%에 도달`, recommended_action: '월 한도와 사용 추세를 확인하세요.', impact: '해당 기능 중단 가능성', count: 1 })
  if ((backlog.count ?? 0) > 100) signals.push({ fingerprint: 'enrichment:backlog', category: 'enrichment', severity: 'warning', title: '본문 보강 지연', suspected_cause: '원문 서버 응답 지연 추정', recommended_action: '실패 로그 확인 또는 해당 소스를 일시 중지하세요.', impact: `대기 콘텐츠 ${backlog.count ?? 0}건`, count: backlog.count ?? 0 })
  if (routingModelErrors.error) {
    console.error('[운영이슈] LLM 라우팅 모델 오류 조회 실패:', routingModelErrors.error.message)
  }
  for (const route of routingModelErrors.data ?? []) {
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
  }

  signals.push(...buildCronAbsenceSignals(lastRunAtByKey, Date.now()))

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
