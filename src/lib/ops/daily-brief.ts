import type { SupabaseClient } from '@supabase/supabase-js'
import { getProviderKeyCount } from '@/lib/llm/provider-key-count'
import { LLM_PROVIDERS } from '@/lib/llm'

export type BriefSeverity = 'critical' | 'warning' | 'notice'
export interface BriefAlert { severity: BriefSeverity; message: string }
export interface BriefIssue { title: string; severity: BriefSeverity; occurrence_count: number; first_seen_at: string | null; last_seen_at: string | null; recommended_action: string | null }
export interface DailyBrief {
  date: string
  alerts: BriefAlert[]
  issues: BriefIssue[]
  system: { crawlFailed: number; crawlPartial: number; backlog: number; failedJobs: number }
  collection: { today: number; published: number; rejected: number; pending: number; topSourceShare: number; activeSources: number }
  usage: { llm: { provider: string; used: number; limit: number; percent: number }[]; translationChars: number; translationCap: number; ttsChars: number; ttsCap: number }
  users: { total: number; newToday: number; pending: number; inactive7d: number }
}

const dayStart = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.toISOString() }
const month = () => new Date().toISOString().slice(0, 7)
const pct = (used: number, limit: number) => limit > 0 ? Math.round(used / limit * 100) : 0

export async function gatherDailyBrief(admin: SupabaseClient): Promise<DailyBrief> {
  const start = dayStart()
  const period = month()
  const [failed, partial, backlog, today, published, rejected, pending, activeSources, failedJobs, users, newUsers, pendingUsers, inactive, sourceRows, llm, settings, translation, tts, issuesResult] = await Promise.all([
    admin.from('crawl_logs').select('id', { count: 'exact', head: true }).gte('started_at', start).eq('status', 'failed'),
    admin.from('crawl_logs').select('id', { count: 'exact', head: true }).gte('started_at', start).eq('status', 'partial'),
    admin.from('contents').select('id', { count: 'exact', head: true }).is('body_fetched_at', null).not('original_url', 'is', null),
    admin.from('contents').select('id', { count: 'exact', head: true }).gte('collected_at', start),
    admin.from('contents').select('id', { count: 'exact', head: true }).gte('collected_at', start).eq('status', 'published'),
    admin.from('contents').select('id', { count: 'exact', head: true }).gte('collected_at', start).eq('status', 'rejected'),
    admin.from('contents').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
    admin.from('sources').select('id', { count: 'exact', head: true }).eq('is_active', true),
    admin.from('job_runs').select('id', { count: 'exact', head: true }).gte('started_at', start).neq('status', 'success'),
    admin.from('users').select('id', { count: 'exact', head: true }),
    admin.from('users').select('id', { count: 'exact', head: true }).gte('created_at', start),
    admin.from('users').select('id', { count: 'exact', head: true }).eq('approval_status', 'pending'),
    admin.from('users').select('id', { count: 'exact', head: true }).lt('last_seen_at', new Date(Date.now() - 7 * 86400000).toISOString()),
    admin.from('contents').select('source_id').gte('collected_at', new Date(Date.now() - 30 * 86400000).toISOString()).not('source_id', 'is', null).limit(10000),
    admin.from('llm_usage').select('provider, tokens').eq('period', period),
    admin.from('llm_settings').select('provider, monthly_token_limit').eq('enabled', true),
    admin.from('translation_usage').select('chars').eq('period', period),
    admin.from('tts_usage').select('chars').eq('period', period),
    admin.from('ops_issues').select('title, severity, occurrence_count, first_seen_at, last_seen_at, recommended_action').in('status', ['open', 'acknowledged', 'in_progress']).in('severity', ['critical', 'warning']).order('severity').order('last_seen_at', { ascending: false }),
  ])
  const counts = (q: { count?: number | null }) => q.count ?? 0
  const sourceCounts = new Map<string, number>(); for (const row of sourceRows.data ?? []) sourceCounts.set(row.source_id, (sourceCounts.get(row.source_id) ?? 0) + 1)
  const sourceTotal = [...sourceCounts.values()].reduce((a, b) => a + b, 0)
  const topSourceShare = sourceTotal ? Math.round(Math.max(...sourceCounts.values()) / sourceTotal * 100) : 0
  const settingsMap = new Map((settings.data ?? []).map((s) => [s.provider, Number(s.monthly_token_limit ?? 1_000_000)]))
  const usageMap = new Map<string, number>(); for (const row of llm.data ?? []) usageMap.set(row.provider, (usageMap.get(row.provider) ?? 0) + Number(row.tokens ?? 0))
  const usage = [...usageMap].map(([provider, used]) => { const configuredProvider = LLM_PROVIDERS.find(p => p.name === provider); const keyCount = configuredProvider ? getProviderKeyCount(configuredProvider) : 1; const limit = (settingsMap.get(provider) ?? 1_000_000) * keyCount; return { provider, used, limit, percent: pct(used, limit) } })
  const translationChars = (translation.data ?? []).reduce((n, r) => n + Number(r.chars ?? 0), 0)
  const ttsChars = (tts.data ?? []).reduce((n, r) => n + Number(r.chars ?? 0), 0)
  const translationCap = Number(process.env.TRANSLATION_MONTHLY_CHAR_CAP ?? 1_000_000)
  const ttsCap = Number(process.env.TTS_MONTHLY_CHAR_CAP ?? 1_000_000)
  const alerts: BriefAlert[] = []
  if (!counts(today)) alerts.push({ severity: 'critical', message: '오늘 수집 0건 — 수집 스케줄과 소스 상태를 확인하세요.' })
  if (counts(failed) > 0 && counts(failed) === counts(activeSources)) alerts.push({ severity: 'critical', message: '오늘 수집이 전면 실패했습니다.' })
  if (usage.some(u => u.percent >= 95) || pct(translationChars, translationCap) >= 95 || pct(ttsChars, ttsCap) >= 95) alerts.push({ severity: 'critical', message: '외부 사용량이 월 한도의 95% 이상입니다.' })
  if (counts(backlog) > 100 || counts(partial) > 0 || topSourceShare >= 70) alerts.push({ severity: 'warning', message: `본문 보강 대기 ${counts(backlog)}건, 수집 일부 실패 ${counts(partial)}건, 최고 매체 비중 ${topSourceShare}%입니다.` })
  const issues = (issuesResult.data ?? []) as BriefIssue[]
  if (issues.length) alerts.splice(0, alerts.length, ...issues.map(i => ({ severity: i.severity, message: `${i.title} — ${i.occurrence_count}회 발생${i.recommended_action ? ` · 권장: ${i.recommended_action}` : ''}` })))
  if (!alerts.length) alerts.push({ severity: 'notice', message: '주요 시스템 정상' })
  return { date: new Date().toISOString(), alerts, issues, system: { crawlFailed: counts(failed), crawlPartial: counts(partial), backlog: counts(backlog), failedJobs: counts(failedJobs) }, collection: { today: counts(today), published: counts(published), rejected: counts(rejected), pending: counts(pending), topSourceShare, activeSources: counts(activeSources) }, usage: { llm: usage, translationChars, translationCap, ttsChars, ttsCap }, users: { total: counts(users), newToday: counts(newUsers), pending: counts(pendingUsers), inactive7d: counts(inactive) } }
}

const esc = (v: unknown) => String(v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] ?? c))
export function buildDailyBriefHtml(brief: DailyBrief): string {
  const label = { critical: '긴급', warning: '주의', notice: '정상' }
  const alerts = brief.alerts.map(a => `<li><b>${label[a.severity]}</b> ${esc(a.message)}</li>`).join('')
  const usage = brief.usage.llm.map(u => `<li>${esc(u.provider)}: ${u.used.toLocaleString()} / ${u.limit.toLocaleString()} (${u.percent}%)</li>`).join('') || '<li>사용량 기록 없음</li>'
  return `<!doctype html><html><body style="font-family:Arial,sans-serif;color:#202124;max-width:680px;margin:auto"><h1>인사이트 아웃 일일 운영 브리핑</h1><p>${brief.date.slice(0, 10)}</p><h2>오늘 반드시 확인</h2><ul>${alerts}</ul><h2>시스템 건강도</h2><p>수집 실패 ${brief.system.crawlFailed}건 · 부분 실패 ${brief.system.crawlPartial}건 · 작업 실패 ${brief.system.failedJobs}건 · 본문 보강 대기 ${brief.system.backlog}건</p><h2>사용자 현황</h2><p>가입 ${brief.users.total}명 · 오늘 신규 ${brief.users.newToday}명 · 승인 대기 ${brief.users.pending}명 · 7일 미접속 ${brief.users.inactive7d}명</p><h2>수집·게시</h2><p>오늘 수집 ${brief.collection.today}건 · 게시 ${brief.collection.published}건 · 거절 ${brief.collection.rejected}건 · pending ${brief.collection.pending}건 · 최고 매체 비중 ${brief.collection.topSourceShare}%</p><h2>AI·외부 사용량</h2><ul>${usage}</ul><p>번역 ${brief.usage.translationChars.toLocaleString()} / ${brief.usage.translationCap.toLocaleString()}자 · TTS ${brief.usage.ttsChars.toLocaleString()} / ${brief.usage.ttsCap.toLocaleString()}자</p><hr><p><a href="${process.env.NEXT_PUBLIC_APP_URL ?? 'https://insight-out-app.vercel.app'}/admin">어드민 운영 대시보드 열기</a></p></body></html>`
}
