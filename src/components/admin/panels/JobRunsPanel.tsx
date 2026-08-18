import Link from 'next/link'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { redirect } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import JobRunsTable, { type JobRunRow } from '@/components/admin/JobRunsTable'
import { EXPECTED_CRONS } from '@/lib/jobs/expected-crons'
import { cn } from '@/lib/utils'

const STATUS_FILTERS: { value: string; label: string }[] = [
  { value: '', label: '전체' },
  { value: 'failed', label: '실패' },
  { value: 'succeeded', label: '성공' },
  { value: 'skipped', label: '스킵' },
  { value: 'running', label: '실행 중' },
]

const RANGE_FILTERS: { value: string; label: string; days: number | null }[] = [
  { value: '1',  label: '최근 24시간', days: 1 },
  { value: '7',  label: '최근 7일',    days: 7 },
  { value: '30', label: '최근 30일',   days: 30 },
  { value: 'all', label: '전체',       days: null },
]

function formatKST(d: string | null): string {
  if (!d) return '—'
  return new Date(d).toLocaleString('ko-KR', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

function buildHref(params: Record<string, string>): string {
  const sp = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== ''))
  const qs = sp.toString()
  return qs ? `/admin/job-runs?${qs}` : '/admin/job-runs'
}

const PAGE_SIZE = 50
const SORT_KEYS = new Set(['started_at', 'job_key', 'status', 'duration_ms'])

interface JobRunsPanelProps {
  searchParams: { status?: string; job?: string; range?: string; page?: string; sort?: string; dir?: string }
}

/** 524 — job-runs/page.tsx 에서 이식. 데이터 로딩·필터 로직 불변, AdminPageHeader 만 제거(허브가 대신 렌더). */
export default async function JobRunsPanel({ searchParams }: JobRunsPanelProps) {
  const status = searchParams.status ?? ''
  const jobFilter = searchParams.job ?? ''
  const range = searchParams.range ?? '7'
  const parsedPage = Number.parseInt(searchParams.page ?? '1', 10)
  const page = Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1
  const sortKey = searchParams.sort && SORT_KEYS.has(searchParams.sort) ? searchParams.sort : 'started_at'
  const sortDir = searchParams.dir === 'asc' ? 'asc' : 'desc'

  // 어드민 role 직접 재확인(미들웨어 의존 금지, 289 §3-4)
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(toSet) { toSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options)) },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('users').select('role').eq('id', user.id).single()
  if (!profile || profile.role !== 'admin') redirect('/dashboard')

  // job_runs 는 RLS 정책 없음(service_role 전용) — admin 클라이언트로 조회
  const admin = createAdminClient()

  let query = admin
    .from('job_runs')
    .select('id, job_key, trigger, mode, status, started_at, finished_at, duration_ms, processed, filled, skipped_count, remaining, error', { count: 'exact' })
    .order(sortKey, { ascending: sortDir === 'asc' })

  if (status) query = query.eq('status', status)
  if (jobFilter) query = query.ilike('job_key', `%${jobFilter}%`)

  const rangeDef = RANGE_FILTERS.find((r) => r.value === range) ?? RANGE_FILTERS[1]
  if (rangeDef.days !== null) {
    // Date.now() purity 규칙 회피 (crawl-logs/page.tsx 패턴과 동일)
    const cutoffDate = new Date()
    cutoffDate.setDate(cutoffDate.getDate() - rangeDef.days)
    query = query.gte('started_at', cutoffDate.toISOString())
  }

  query = query.range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1)
  const { data, error, count } = await query
  const ready = !error
  const runs = (data ?? []) as JobRunRow[]

  // 292 — 계측 누락("EXPECTED_CRONS 에 있는데 job_runs 에 기록이 없음") + "안 돈 크론"
  // (기록은 있는데 maxAgeHours 초과) 을 한 장치로 감지. skipped 도 "돌았다"로 친다(§4 가드).
  type CronTone = 'ok' | 'stale' | 'missing'
  interface CronStatus { key: string; label: string; tone: CronTone; lastAt: string | null }
  let cronStatuses: CronStatus[] = []
  if (ready) {
    // Date.now() purity 규칙 회피 (§120 cutoffDate 패턴과 동일) — 루프 밖에서 한 번만 스냅샷.
    const nowMs = new Date().getTime()
    cronStatuses = await Promise.all(
      EXPECTED_CRONS.map(async (c) => {
        const { data: row } = await admin
          .from('job_runs')
          .select('started_at')
          .eq('job_key', c.key)
          .order('started_at', { ascending: false })
          .limit(1)
          .maybeSingle()
        const lastAt = (row as { started_at: string } | null)?.started_at ?? null
        let tone: CronTone = 'missing'
        if (lastAt) {
          const ageHours = (nowMs - new Date(lastAt).getTime()) / 3_600_000
          tone = ageHours <= c.maxAgeHours ? 'ok' : 'stale'
        }
        return { key: c.key, label: c.label, tone, lastAt }
      })
    )
  }
  const allCronsNormal = cronStatuses.length > 0 && cronStatuses.every((c) => c.tone === 'ok')

  return (
    <>
      {cronStatuses.length > 0 && (
        <div className="rounded-xl border border-border p-3">
          {allCronsNormal ? (
            <p className="text-xs text-muted-foreground">
              <span className="mr-1 text-positive">●</span>
              크론 상태: {cronStatuses.length}개 모두 정상
            </p>
          ) : (
            <div className="space-y-1">
              <p className="mb-1 text-xs font-medium text-foreground">크론 상태</p>
              {cronStatuses.map((c) => (
                <p
                  key={c.key}
                  className={cn(
                    'text-xs',
                    c.tone === 'ok' && 'text-muted-foreground',
                    c.tone === 'stale' && 'text-amber-600',
                    c.tone === 'missing' && 'text-destructive'
                  )}
                >
                  {c.tone === 'ok' ? '●' : '▲'} {c.label}
                  {c.tone === 'missing' && ' — 계측 안 됨 또는 한 번도 안 돎'}
                  {c.tone === 'stale' && ` — 안 돈 지 오래됨 (마지막: ${formatKST(c.lastAt)})`}
                </p>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5">
          {STATUS_FILTERS.map((f) => (
            // prefetch-ok: 필터 칩 — 개수 고정, 이동 잦음
            <Link
              key={f.value}
              href={buildHref({ status: f.value, job: jobFilter, range, page: '1', sort: sortKey, dir: sortDir })}
              className={cn(
                'inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                status === f.value
                  ? 'border-brand-600 bg-brand-600/10 text-brand-600'
                  : 'border-border text-muted-foreground hover:text-foreground'
              )}
            >
              {f.label}
            </Link>
          ))}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {RANGE_FILTERS.map((f) => (
            // prefetch-ok: 필터 칩 — 개수 고정, 이동 잦음
            <Link
              key={f.value}
              href={buildHref({ status, job: jobFilter, range: f.value, page: '1', sort: sortKey, dir: sortDir })}
              className={cn(
                'inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                range === f.value
                  ? 'border-brand-600 bg-brand-600/10 text-brand-600'
                  : 'border-border text-muted-foreground hover:text-foreground'
              )}
            >
              {f.label}
            </Link>
          ))}
        </div>
      </div>

      <JobRunsTable
        key={`${page}-${sortKey}-${sortDir}-${status}-${jobFilter}-${range}`}
        rows={runs}
        state={!ready ? 'error' : runs.length === 0 ? 'empty' : 'idle'}
        errorMessage={error?.code === '42P01' ? '작업 이력 테이블이 아직 준비되지 않았습니다 (SQL 289 미적용).' : '작업 이력을 불러오지 못했습니다.'}
        page={page}
        pageSize={PAGE_SIZE}
        total={count}
        sort={{ key: sortKey, dir: sortDir }}
      />
    </>
  )
}
