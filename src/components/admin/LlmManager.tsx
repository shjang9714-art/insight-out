'use client'

import { useState, useEffect } from 'react'
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts'
import { Loader2, CheckCircle2, XCircle, FlaskConical } from 'lucide-react'
import AdminErrorBox from '@/components/admin/ui/AdminErrorBox'
import AdminTable, { type AdminTableColumn } from '@/components/admin/ui/AdminTable'
import StatusBadge from '@/components/admin/ui/StatusBadge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { CHART_BRAND, CHART_MUTED } from '@/lib/admin/palette'

// ─── 타입 ─────────────────────────────────────────────────────────────────────

interface ProviderInfo {
  name: string
  configured: boolean
  enabled: boolean
  monthly_token_limit: number
  keyCount: number
  effectiveTokenLimit: number
  tokens_used: number
  calls_used: number
}

interface RoutingRow {
  task_type: string
  priority: number
  provider: string
  model_id: string
  is_active: boolean
}

interface LlmData {
  period: string
  providers: ProviderInfo[]
  routing: RoutingRow[]
  models: { provider: string; model_id: string; label: string | null; is_active: boolean }[]
}

interface TestResult {
  ok: boolean
  test?: {
    task: string
    responded_provider: string | null
    responded_model: string | null
    text: string | null
    ok: boolean
  }
  error?: string
}

// ─── 태스크 라벨 ──────────────────────────────────────────────────────────────

const TASK_LABELS: Record<string, string> = {
  classify:  '분류',
  summarize: '요약',
  report:    '보고서',
}

const ROUTING_COLUMNS: AdminTableColumn<RoutingRow>[] = [
  {
    key: 'priority',
    header: '우선순위',
    numeric: true,
    nowrap: true,
    cell: row => row.priority,
  },
  {
    key: 'provider',
    header: 'Provider',
    nowrap: true,
    cell: row => <span className="font-medium capitalize">{row.provider}</span>,
  },
  {
    key: 'model',
    header: '모델',
    cell: row => (
      <span className="font-mono text-[11px] text-muted-foreground">{row.model_id}</span>
    ),
  },
  {
    key: 'status',
    header: '상태',
    nowrap: true,
    cell: row => row.is_active ? (
      <span className="text-positive">활성</span>
    ) : (
      <span className="text-muted-foreground">비활성</span>
    ),
  },
]

// ─── 컴포넌트 ─────────────────────────────────────────────────────────────────

export default function LlmManager() {
  const [data, setData]           = useState<LlmData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError]         = useState<string | null>(null)
  const [togglingId, setTogglingId] = useState<string | null>(null)
  const [isTesting, setIsTesting] = useState(false)
  const [testResult, setTestResult] = useState<TestResult | null>(null)
  const [searchProvider, setSearchProvider] = useState('')
  const [searchModel, setSearchModel] = useState('')
  const [isSavingSearch, setIsSavingSearch] = useState(false)

  async function fetchData() {
    try {
      const res = await fetch('/api/admin/llm')
      const json = await res.json() as LlmData & { error?: string }
      if (!res.ok) throw new Error(json.error ?? '조회 실패')
      setData(json)
      const searchRouting = json.routing.find(
        row => row.task_type === 'search' && row.priority === 1
      )
      setSearchProvider(searchRouting?.provider ?? '')
      setSearchModel(searchRouting?.model_id ?? '')
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : '불러오기 실패')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    const init = async () => { await fetchData() }
    void init()
  }, [])

  const handleToggle = async (provider: string, current: boolean) => {
    setTogglingId(provider)
    try {
      const res = await fetch('/api/admin/llm', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, enabled: !current }),
      })
      if (!res.ok) {
        const json = await res.json() as { error?: string }
        throw new Error(json.error ?? '업데이트 실패')
      }
      setData(prev => prev ? {
        ...prev,
        providers: prev.providers.map(p =>
          p.name === provider ? { ...p, enabled: !current } : p
        ),
      } : prev)
    } catch (e) {
      setError(e instanceof Error ? e.message : '업데이트에 실패했습니다.')
    } finally {
      setTogglingId(null)
    }
  }

  const handleTest = async () => {
    if (!window.confirm('LLM classify 호출 1회가 소모됩니다. 계속하시겠습니까?')) return
    setIsTesting(true)
    setTestResult(null)
    try {
      const res = await fetch('/api/admin/llm-test')
      const json = await res.json() as TestResult & { test?: TestResult['test'] }
      setTestResult({ ok: res.ok, test: json.test, error: (json as { error?: string }).error })
    } catch (e) {
      setTestResult({ ok: false, error: e instanceof Error ? e.message : '테스트 실패' })
    } finally {
      setIsTesting(false)
    }
  }

  const saveSearchRouting = async (isActive: boolean) => {
    if (!searchProvider || !searchModel) {
      setError('검색 AI 답변에 사용할 provider와 모델을 선택해주세요.')
      return
    }

    setIsSavingSearch(true)
    try {
      const res = await fetch('/api/admin/llm', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          task_type: 'search',
          priority: 1,
          provider: searchProvider,
          model_id: searchModel,
          is_active: isActive,
        }),
      })
      const json = await res.json() as { error?: string; routing?: RoutingRow }
      if (!res.ok || !json.routing) {
        throw new Error(json.error ?? '검색 AI 답변 설정 저장에 실패했습니다.')
      }
      const savedRouting = json.routing

      setData(prev => prev ? {
        ...prev,
        routing: [
          ...prev.routing.filter(
            row => !(row.task_type === 'search' && row.priority === 1)
          ),
          savedRouting,
        ],
      } : prev)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : '검색 AI 답변 설정 저장에 실패했습니다.')
    } finally {
      setIsSavingSearch(false)
    }
  }

  // ── 로딩 / 에러 ──────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <AdminTable
        columns={ROUTING_COLUMNS}
        rows={[]}
        rowKey={row => `${row.task_type}-${row.priority}-${row.provider}-${row.model_id}`}
        loading
      />
    )
  }

  if (error && !data) {
    return (
      <AdminErrorBox>
        {error}
      </AdminErrorBox>
    )
  }

  if (!data) return null

  // ── 차트 데이터 ──────────────────────────────────────────────────────────

  const chartData = data.providers.map(p => ({
    name: p.name,
    토큰: p.tokens_used,
    호출: p.calls_used,
  }))

  // ── 라우팅 — task별 그룹 ─────────────────────────────────────────────────

  const routingByTask: Record<string, RoutingRow[]> = {}
  for (const row of data.routing) {
    if (!routingByTask[row.task_type]) routingByTask[row.task_type] = []
    routingByTask[row.task_type].push(row)
  }
  const searchRouting = data.routing.find(
    row => row.task_type === 'search' && row.priority === 1
  )
  const searchProviderInfo = data.providers.find(
    provider => provider.name === searchProvider
  )
  const searchUsagePct = searchProviderInfo && searchProviderInfo.effectiveTokenLimit > 0
    ? Math.round(
      searchProviderInfo.tokens_used / searchProviderInfo.effectiveTokenLimit * 100
    )
    : 0
  const searchModels = data.models.filter(
    model => model.provider === searchProvider && model.is_active
  )

  return (
    <div className="space-y-8">

      {/* ① Provider 현황 카드 */}
      <section>
        <h2 className="mb-3 text-sm font-semibold text-foreground">Provider 현황</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {data.providers.map(p => {
            const usagePct = p.effectiveTokenLimit > 0
              ? Math.round(p.tokens_used / p.effectiveTokenLimit * 100)
              : 0
            const isBlocked = p.effectiveTokenLimit > 0
              && p.tokens_used >= p.effectiveTokenLimit
            return (
              <div
                key={p.name}
                className="rounded-xl border border-border bg-card p-4 space-y-3"
              >
                {/* 헤더: 이름 + 키 상태 + enabled 토글 */}
                <div className="flex items-start justify-between gap-2">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <p className="text-sm font-semibold text-foreground capitalize">{p.name}</p>
                      {!p.enabled ? (
                        <StatusBadge tone="neutral" label="비활성" />
                      ) : isBlocked ? (
                        <StatusBadge tone="negative" label="차단(폴백 전환)" />
                      ) : null}
                    </div>
                    {p.configured ? (
                      <span className="inline-flex items-center gap-1 text-[11px] text-positive">
                        <CheckCircle2 className="h-3 w-3" />키 등록됨
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[11px] text-negative font-medium">
                        <XCircle className="h-3 w-3" />env 키 미등록
                      </span>
                    )}
                  </div>
                  <button
                    onClick={() => void handleToggle(p.name, p.enabled)}
                    disabled={togglingId === p.name}
                    className={cn(
                      'relative h-5 w-9 shrink-0 rounded-full transition-colors',
                      p.enabled ? 'bg-brand-600' : 'bg-muted-foreground/30',
                      togglingId === p.name && 'opacity-50 cursor-not-allowed'
                    )}
                    aria-label={p.enabled ? '비활성화' : '활성화'}
                  >
                    <span className={cn(
                      'absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform',
                      p.enabled ? 'translate-x-4' : 'translate-x-0.5'
                    )} />
                  </button>
                </div>

                {/* 이번 달 사용량 */}
                <div className="space-y-1.5">
                  <div className="flex justify-between text-[11px] text-muted-foreground">
                    <span>{p.tokens_used.toLocaleString()} 토큰</span>
                    <span>{p.calls_used} 호출</span>
                  </div>
                  <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                    <div
                      className={cn(
                        'h-full rounded-full transition-all',
                        usagePct >= 90 ? 'bg-destructive' : usagePct >= 70 ? 'bg-amber-500' : 'bg-brand-600'
                      )}
                      style={{ width: `${Math.min(100, usagePct)}%` }}
                    />
                  </div>
                  <p className="text-[10px] text-muted-foreground/70 text-right">
                    {p.keyCount > 0
                      ? `월 한도 ${p.monthly_token_limit.toLocaleString()} × ${p.keyCount}키 = ${p.effectiveTokenLimit.toLocaleString()} 중 ${usagePct}%`
                      : '키 미설정'
                    }
                  </p>
                </div>
              </div>
            )
          })}
        </div>
      </section>

      {/* ② 검색 AI 답변 설정 */}
      <section>
        <h2 className="mb-3 text-sm font-semibold text-foreground">검색 AI 답변</h2>
        <div className="rounded-xl border border-border bg-card p-5 space-y-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium text-foreground">검색 전용 LLM 라우팅</p>
                {searchRouting?.is_active ? (
                  <StatusBadge tone="positive" label="켜짐" />
                ) : searchRouting ? (
                  <StatusBadge tone="neutral" label="꺼짐" />
                ) : (
                  <StatusBadge tone="neutral" label="미설정(검색 AI 답변 꺼짐)" />
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                다른 작업이 쓰지 않는 provider를 지정하세요. 검색은 호출이 잦아 예산을 함께 쓰면 다른 작업이 막힙니다.
              </p>
            </div>
            <button
              onClick={() => void saveSearchRouting(!searchRouting?.is_active)}
              disabled={isSavingSearch || !searchProvider || !searchModel}
              className={cn(
                'relative h-5 w-9 shrink-0 rounded-full transition-colors',
                searchRouting?.is_active ? 'bg-brand-600' : 'bg-muted-foreground/30',
                (isSavingSearch || !searchProvider || !searchModel)
                  && 'cursor-not-allowed opacity-50'
              )}
              aria-label={searchRouting?.is_active ? '검색 AI 답변 끄기' : '검색 AI 답변 켜기'}
            >
              <span className={cn(
                'absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform',
                searchRouting?.is_active ? 'translate-x-4' : 'translate-x-0.5'
              )} />
            </button>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <label className="text-xs font-medium text-foreground" htmlFor="search-provider">
                Provider
              </label>
              <Select
                value={searchProvider}
                onValueChange={provider => {
                  setSearchProvider(provider)
                  setSearchModel('')
                }}
                disabled={isSavingSearch}
              >
                <SelectTrigger id="search-provider">
                  <SelectValue placeholder="Provider를 선택하세요" />
                </SelectTrigger>
                <SelectContent>
                  {data.providers.map(provider => (
                    <SelectItem key={provider.name} value={provider.name}>
                      {provider.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-medium text-foreground" htmlFor="search-model">
                모델
              </label>
              <Select
                value={searchModel}
                onValueChange={setSearchModel}
                disabled={isSavingSearch || !searchProvider}
              >
                <SelectTrigger id="search-model">
                  <SelectValue placeholder={
                    searchProvider ? '모델을 선택하세요' : 'Provider를 먼저 선택하세요'
                  } />
                </SelectTrigger>
                <SelectContent>
                  {searchModels.map(model => (
                    <SelectItem key={model.model_id} value={model.model_id}>
                      {model.label ?? model.model_id}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {searchProviderInfo && (
            <div className="rounded-lg bg-muted/40 px-4 py-3 text-xs text-muted-foreground">
              {searchProviderInfo.keyCount > 0 ? (
                <p>
                  이번 달 사용률 {searchUsagePct}% ·{' '}
                  {searchProviderInfo.tokens_used.toLocaleString()} /{' '}
                  {searchProviderInfo.effectiveTokenLimit.toLocaleString()} 토큰
                </p>
              ) : (
                <p>키 미설정 · 이번 달 사용률 0%</p>
              )}
            </div>
          )}

          <div className="flex justify-end">
            <button
              onClick={() => void saveSearchRouting(searchRouting?.is_active ?? false)}
              disabled={isSavingSearch || !searchProvider || !searchModel}
              className="rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSavingSearch ? '저장 중...' : 'Provider·모델 저장'}
            </button>
          </div>
        </div>
      </section>

      {/* ③ 사용량 통계 막대 차트 */}
      <section>
        <h2 className="mb-3 text-sm font-semibold text-foreground">
          이번 달 사용량 ({data.period})
        </h2>
        <div className="rounded-xl border border-border bg-card p-5">
          {chartData.every(d => d.토큰 === 0) ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              이번 달 사용 기록이 없습니다.
            </p>
          ) : (
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={chartData} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip
                  formatter={(value) => [(value as number).toLocaleString()]}
                  contentStyle={{ fontSize: 12 }}
                />
                <Bar dataKey="토큰" fill={CHART_BRAND} radius={[3, 3, 0, 0]} />
                <Bar dataKey="호출" fill={CHART_MUTED} radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </section>

      {/* ④ 용도별 라우팅 표 */}
      <section>
        <h2 className="mb-3 text-sm font-semibold text-foreground">용도별 라우팅</h2>
        {Object.keys(routingByTask).length === 0 ? (
          <AdminTable
            columns={ROUTING_COLUMNS}
            rows={[]}
            rowKey={row => `${row.task_type}-${row.priority}-${row.provider}-${row.model_id}`}
            empty={{
              message: '설정된 라우팅이 없습니다.',
              hint: '폴백 풀로 동작 중입니다.',
            }}
          />
        ) : (
          <div className="space-y-4">
            {Object.entries(routingByTask).map(([task, rows]) => (
              <div key={task} className="space-y-2">
                <div className="flex items-center px-1">
                  <span className="text-xs font-semibold text-foreground">
                    {TASK_LABELS[task] ?? task}
                  </span>
                  <span className="ml-2 text-[11px] text-muted-foreground">({task})</span>
                </div>
                <AdminTable
                  columns={ROUTING_COLUMNS}
                  rows={rows}
                  rowKey={row => `${row.task_type}-${row.priority}-${row.provider}-${row.model_id}`}
                  rowClassName={row => cn(!row.is_active && 'opacity-50')}
                />
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ⑤ 연동 테스트 */}
      <section>
        <h2 className="mb-3 text-sm font-semibold text-foreground">연동 테스트</h2>
        <div className="rounded-xl border border-border bg-card p-5 space-y-4">
          <div className="flex items-center gap-3 flex-wrap">
            <button
              onClick={() => void handleTest()}
              disabled={isTesting}
              className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50 transition-colors"
            >
              {isTesting
                ? <><Loader2 className="h-3.5 w-3.5 animate-spin" />테스트 중...</>
                : <><FlaskConical className="h-3.5 w-3.5" />classify 테스트</>
              }
            </button>
            <p className="text-xs text-muted-foreground">호출 1회가 소모됩니다.</p>
          </div>

          {testResult && (
            <div className={cn(
              'rounded-lg border px-4 py-3 text-sm space-y-1',
              testResult.ok && testResult.test?.ok
                ? 'border-positive/20 bg-positive-soft text-positive'
                : 'border-negative/20 bg-negative-soft text-negative'
            )}>
              {testResult.error ? (
                <p>{testResult.error}</p>
              ) : testResult.test ? (
                <>
                  <p>
                    {testResult.test.ok ? '✅ 성공' : '❌ 실패'}{' '}
                    {testResult.test.responded_provider && (
                      <span className="font-medium capitalize">{testResult.test.responded_provider}</span>
                    )}
                    {testResult.test.responded_model && (
                      <span className="font-mono text-xs ml-1">({testResult.test.responded_model})</span>
                    )}
                  </p>
                  {testResult.test.text && (
                    <p className="font-mono text-[11px] bg-white/60 rounded px-2 py-1 break-all">
                      {testResult.test.text}
                    </p>
                  )}
                </>
              ) : null}
            </div>
          )}
        </div>
      </section>

      {/* 에러 배너 */}
      {error && (
        <AdminErrorBox>
          {error}
        </AdminErrorBox>
      )}
    </div>
  )
}
