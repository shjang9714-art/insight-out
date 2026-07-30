import type { SupabaseClient } from '@supabase/supabase-js'
import { getProviderKeyCount } from '@/lib/llm/provider-key-count'
import { LLM_PROVIDERS } from '@/lib/llm'
import {
  DEFAULT_MONTHLY_TOKEN_LIMIT,
  effectiveTokenLimit,
} from '@/lib/llm/token-limit'

type Severity = 'critical' | 'warning' | 'notice'
export interface WeeklyReport {
  periodStart: string
  periodEnd: string
  collection: { total: number; published: number; rejected: number; dailyAvg: number; prevTotal: number; deltaPct: number; topSourceShare: number }
  system: { crawlFailed: number; crawlPartial: number; failedJobs: number; backlog: number }
  issues: { openedThisWeek: number; resolvedThisWeek: number; stillOpen: number; topOpen: { title: string; severity: Severity; occurrence_count: number; recommended_action: string | null }[] }
  users: { total: number; newThisWeek: number; pending: number; inactive7d: number }
  usage: { llm: { provider: string; used: number; limit: number; percent: number }[] }
}

const count = (query: { count?: number | null }) => query.count ?? 0
const pct = (used: number, limit: number) => limit > 0 ? Math.round(used / limit * 100) : 0
const esc = (value: unknown) => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] ?? c))

export async function gatherWeeklyReport(admin: SupabaseClient): Promise<WeeklyReport> {
  const now = new Date()
  const weekStart = new Date(now.getTime() - 7 * 86400000)
  const prevStart = new Date(now.getTime() - 14 * 86400000)
  const start = weekStart.toISOString()
  const previous = prevStart.toISOString()
  const end = now.toISOString()
  const month = now.toISOString().slice(0, 7)
  const [failed, partial, total, published, rejected, prevTotal, backlog, failedJobs, sourceRows, users, newUsers, pendingUsers, inactive, llm, settings, opened, resolved, stillOpen] = await Promise.all([
    admin.from('crawl_logs').select('id', { count: 'exact', head: true }).gte('started_at', start).eq('status', 'failed'),
    admin.from('crawl_logs').select('id', { count: 'exact', head: true }).gte('started_at', start).eq('status', 'partial'),
    admin.from('contents').select('id', { count: 'exact', head: true }).gte('collected_at', start),
    admin.from('contents').select('id', { count: 'exact', head: true }).gte('collected_at', start).eq('status', 'published'),
    admin.from('contents').select('id', { count: 'exact', head: true }).gte('collected_at', start).eq('status', 'rejected'),
    admin.from('contents').select('id', { count: 'exact', head: true }).gte('collected_at', previous).lt('collected_at', start),
    admin.from('contents').select('id', { count: 'exact', head: true }).is('body_fetched_at', null).not('original_url', 'is', null),
    admin.from('job_runs').select('id', { count: 'exact', head: true }).gte('started_at', start).neq('status', 'success'),
    admin.from('contents').select('source_id').gte('collected_at', start).not('source_id', 'is', null).limit(10000),
    admin.from('users').select('id', { count: 'exact', head: true }),
    admin.from('users').select('id', { count: 'exact', head: true }).gte('created_at', start),
    admin.from('users').select('id', { count: 'exact', head: true }).eq('approval_status', 'pending'),
    admin.from('users').select('id', { count: 'exact', head: true }).lt('last_seen_at', new Date(now.getTime() - 7 * 86400000).toISOString()),
    admin.from('llm_usage').select('provider, tokens').eq('period', month),
    admin.from('llm_settings').select('provider, monthly_token_limit').eq('enabled', true),
    admin.from('ops_issues').select('id', { count: 'exact', head: true }).gte('first_seen_at', start),
    admin.from('ops_issues').select('id', { count: 'exact', head: true }).gte('resolved_at', start),
    admin.from('ops_issues').select('title, severity, occurrence_count, recommended_action', { count: 'exact' }).in('status', ['open', 'acknowledged', 'in_progress']).order('severity').order('last_seen_at', { ascending: false }).limit(5),
  ])
  const sourceCounts = new Map<string, number>()
  for (const row of sourceRows.data ?? []) if (row.source_id) sourceCounts.set(row.source_id, (sourceCounts.get(row.source_id) ?? 0) + 1)
  const sourceTotal = [...sourceCounts.values()].reduce((sum, value) => sum + value, 0)
  const topSourceShare = sourceTotal ? Math.round(Math.max(...sourceCounts.values()) / sourceTotal * 100) : 0
  const settingsMap = new Map((settings.data ?? []).map(s => [s.provider, Number(s.monthly_token_limit ?? DEFAULT_MONTHLY_TOKEN_LIMIT)]))
  const usageMap = new Map<string, number>()
  for (const row of llm.data ?? []) usageMap.set(row.provider, (usageMap.get(row.provider) ?? 0) + Number(row.tokens ?? 0))
  const usage = [...usageMap].map(([provider, used]) => {
    const configured = LLM_PROVIDERS.find(p => p.name === provider)
    const keyCount = configured ? getProviderKeyCount(configured) : 0
    const limit = effectiveTokenLimit(settingsMap.get(provider), keyCount)
    // 키 제거 직후 남은 사용 기록은 무해하므로 한도 0은 경고성 비율로 계산하지 않는다.
    return { provider, used, limit, percent: pct(used, limit) }
  })
  const current = count(total)
  const previousTotal = count(prevTotal)
  return {
    periodStart: start, periodEnd: end,
    collection: { total: current, published: count(published), rejected: count(rejected), dailyAvg: Math.round(current / 7), prevTotal: previousTotal, deltaPct: previousTotal ? Math.round((current - previousTotal) / previousTotal * 100) : 0, topSourceShare },
    system: { crawlFailed: count(failed), crawlPartial: count(partial), failedJobs: count(failedJobs), backlog: count(backlog) },
    issues: { openedThisWeek: count(opened), resolvedThisWeek: count(resolved), stillOpen: count(stillOpen), topOpen: (stillOpen.data ?? []) as WeeklyReport['issues']['topOpen'] },
    users: { total: count(users), newThisWeek: count(newUsers), pending: count(pendingUsers), inactive7d: count(inactive) }, usage: { llm: usage },
  }
}

export function buildWeeklyReportHtml(report: WeeklyReport): string {
  const direction = report.collection.deltaPct >= 0 ? '▲' : '▼'
  const issues = report.issues.topOpen.map(i => `<li><b>${esc(i.severity)}</b> ${esc(i.title)} (${i.occurrence_count}회)${i.recommended_action ? ` · 권장: ${esc(i.recommended_action)}` : ''}</li>`).join('') || '<li>미해결 이슈 없음</li>'
  const usage = report.usage.llm.map(u => `<li>${esc(u.provider)}: ${u.used.toLocaleString()} / ${u.limit.toLocaleString()} (${u.percent}%)</li>`).join('') || '<li>사용량 기록 없음</li>'
  return `<!doctype html><html><body style="font-family:Arial,sans-serif;color:#202124;max-width:680px;margin:auto"><h1>인사이트 아웃 주간 운영 리포트</h1><p>${report.periodStart.slice(0, 10)} ~ ${report.periodEnd.slice(0, 10)}</p><h2>이번 주 한눈에</h2><p>수집 ${report.collection.total}건 · 일평균 ${report.collection.dailyAvg}건 · 전주 대비 ${direction} ${Math.abs(report.collection.deltaPct)}%</p><p>게시 ${report.collection.published}건 · 거절 ${report.collection.rejected}건 · 최고 매체 비중 ${report.collection.topSourceShare}%</p><h2>이슈 처리</h2><p>신규 ${report.issues.openedThisWeek}건 · 해결 ${report.issues.resolvedThisWeek}건 · 미해결 ${report.issues.stillOpen}건</p><ul>${issues}</ul><h2>시스템</h2><p>수집 실패 ${report.system.crawlFailed}건 · 부분 실패 ${report.system.crawlPartial}건 · 작업 실패 ${report.system.failedJobs}건 · 본문 보강 대기 ${report.system.backlog}건</p><h2>사용자</h2><p>전체 ${report.users.total}명 · 이번 주 신규 ${report.users.newThisWeek}명 · 승인 대기 ${report.users.pending}명 · 7일 미접속 ${report.users.inactive7d}명</p><h2>AI·외부 사용량</h2><ul>${usage}</ul><hr><p><a href="${process.env.NEXT_PUBLIC_APP_URL ?? 'https://insight-out-app.vercel.app'}/admin">어드민 운영 대시보드 열기</a></p></body></html>`
}
