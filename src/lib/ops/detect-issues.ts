import type { SupabaseClient } from '@supabase/supabase-js'
import { getProviderKeyCount } from '@/lib/llm/provider-key-count'
import { LLM_PROVIDERS } from '@/lib/llm'
import {
  DEFAULT_MONTHLY_TOKEN_LIMIT,
  effectiveTokenLimit,
} from '@/lib/llm/token-limit'

interface Signal { fingerprint: string; category: string; severity: 'critical' | 'warning'; title: string; suspected_cause: string; recommended_action: string; impact: string; count: number }

const since24h = () => new Date(Date.now() - 86_400_000).toISOString()

export async function detectOpsIssues(admin: SupabaseClient): Promise<{ open: number; resolved: number }> {
  const since = since24h()
  const signals: Signal[] = []
  const [jobs, crawls, backlog, usage, settings, translation, tts, routingModelErrors] = await Promise.all([
    admin.from('job_runs').select('job_key').eq('status', 'failed').gte('started_at', since),
    admin.from('crawl_logs').select('source_id, status').in('status', ['failed', 'partial']).gte('started_at', since),
    admin.from('contents').select('id', { count: 'exact', head: true }).eq('status', 'pending').is('body_fetched_at', null),
    admin.from('llm_usage').select('provider, tokens').eq('period', new Date().toISOString().slice(0, 7)),
    admin.from('llm_settings').select('provider, monthly_token_limit').eq('enabled', true),
    admin.from('translation_usage').select('chars').eq('period', new Date().toISOString().slice(0, 7)),
    admin.from('tts_usage').select('chars').eq('period', new Date().toISOString().slice(0, 7)),
    admin
      .from('llm_task_routing')
      .select('task_type, priority, provider, model_id')
      .eq('is_active', true)
      .gte('last_error_at', since),
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
  const caps = [{ key: 'translation', used: (translation.data ?? []).reduce((n, r) => n + Number(r.chars ?? 0), 0), cap: Number(process.env.TRANSLATION_MONTHLY_CHAR_CAP ?? 1_000_000) }, { key: 'tts', used: (tts.data ?? []).reduce((n, r) => n + Number(r.chars ?? 0), 0), cap: Number(process.env.TTS_MONTHLY_CHAR_CAP ?? 1_000_000) }]
  for (const c of caps) if (c.used / c.cap >= 0.8) signals.push({ fingerprint: `usage:limit:${c.key}`, category: 'usage', severity: c.used / c.cap >= 0.95 ? 'critical' : 'warning', title: `${c.key === 'tts' ? 'TTS' : '번역'} 사용량 한도 임박`, suspected_cause: `월 사용량이 ${Math.round(c.used / c.cap * 100)}%에 도달`, recommended_action: '월 한도와 사용 추세를 확인하세요.', impact: '해당 기능 중단 가능성', count: 1 })
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

  const { data: existing } = await admin.from('ops_issues').select('fingerprint, status').in('status', ['open', 'resolved', 'acknowledged', 'in_progress', 'ignored'])
  const seen = new Set(signals.map(s => s.fingerprint)); let resolved = 0
  for (const signal of signals) {
    const prior = (existing ?? []).find(row => row.fingerprint === signal.fingerprint)
    const update = { ...signal, occurrence_count: signal.count, last_seen_at: new Date().toISOString(), ...(prior?.status === 'resolved' || !prior ? { status: 'open', resolved_at: null, alerted_at: null } : {}) }
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
