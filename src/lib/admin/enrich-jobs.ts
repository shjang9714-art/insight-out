export type EnrichJobSurface = 'ai' | 'data'

export type EnrichJobKind = 'loop' | 'once'

export type EnrichJobKey =
  | 'admin:sentiment'
  | 'admin:lgu-impact'
  | 'admin:youtube-summary'
  | 'admin:summary-backfill'
  | 'admin:signals-backfill'
  | 'admin:body-backfill'
  | 'admin:canonical-backfill'
  | 'admin:thumbnail-backfill'
  | 'admin:youtube-transcript'
  | 'admin:pdf-cover-backfill'
  | 'admin:cluster-backfill'
  | 'admin:youtube-tagging'

export interface EnrichJobMeta {
  key: EnrichJobKey
  label: string
  endpoint: string
  usesLlm: boolean
  surface: EnrichJobSurface
  kind: EnrichJobKind
  method: 'POST' | 'GET'
  limit?: number
  modes?: readonly ['fresh', 'retry']
  dateRange?: true
  confirm?: string
}

export interface EnrichJobResult {
  processed: number
  succeeded: number
  skipped: number
  remaining: number | null
  ready: boolean
  extra?: Record<string, number>
}

export const ENRICH_JOBS: readonly EnrichJobMeta[] = [
  {
    key: 'admin:sentiment',
    label: '논조 분석',
    endpoint: '/api/admin/sentiment',
    usesLlm: true,
    surface: 'ai',
    kind: 'once',
    method: 'POST',
    confirm: '최근 14일 추적 기업·이슈 기사(최대 40건)의 논조를 LLM으로 분석하시겠습니까?',
  },
  {
    key: 'admin:lgu-impact',
    label: '위기·기회 분석',
    endpoint: '/api/admin/lgu-impact',
    usesLlm: true,
    surface: 'ai',
    kind: 'once',
    method: 'POST',
    confirm: '최근 14일 경쟁사 기사(최대 40건)를 LG U+ 관점 위기·기회로 분석하시겠습니까?',
  },
  {
    key: 'admin:youtube-summary',
    label: '유튜브 요약 생성',
    endpoint: '/api/admin/youtube-summary',
    usesLlm: true,
    surface: 'ai',
    kind: 'once',
    method: 'POST',
    confirm: '요약 없는 유튜브 콘텐츠(최대 50건)에 제목·채널 기반 요약을 생성하시겠습니까? (LLM 호출)',
  },
  {
    key: 'admin:summary-backfill',
    label: '뉴스 요약 백필',
    endpoint: '/api/admin/summary-backfill',
    usesLlm: true,
    surface: 'ai',
    kind: 'loop',
    method: 'POST',
    limit: 20,
  },
  {
    key: 'admin:signals-backfill',
    label: '신호 분류',
    endpoint: '/api/admin/signals-backfill',
    usesLlm: true,
    surface: 'ai',
    kind: 'loop',
    method: 'POST',
    limit: 10,
  },
  {
    key: 'admin:body-backfill',
    label: '누락 기사 본문 수집',
    endpoint: '/api/admin/body-backfill',
    usesLlm: false,
    surface: 'data',
    kind: 'loop',
    method: 'POST',
    limit: 30,
    dateRange: true,
  },
  {
    key: 'admin:canonical-backfill',
    label: '원문 URL 정규화',
    endpoint: '/api/admin/canonical-backfill',
    usesLlm: false,
    surface: 'data',
    kind: 'loop',
    method: 'GET',
    limit: 15,
  },
  {
    key: 'admin:thumbnail-backfill',
    label: '누락 썸네일 다시 수집',
    endpoint: '/api/admin/thumbnail-backfill',
    usesLlm: false,
    surface: 'data',
    kind: 'loop',
    method: 'POST',
    limit: 20,
    modes: ['fresh', 'retry'],
  },
  {
    key: 'admin:youtube-transcript',
    label: '유튜브 자막 수집',
    endpoint: '/api/admin/youtube-transcript',
    usesLlm: false,
    surface: 'data',
    kind: 'loop',
    method: 'POST',
    limit: 10,
    modes: ['fresh', 'retry'],
  },
  {
    key: 'admin:pdf-cover-backfill',
    label: 'PDF 표지 수집',
    endpoint: '/api/admin/pdf-cover-backfill',
    usesLlm: false,
    surface: 'data',
    kind: 'loop',
    method: 'POST',
    limit: 5,
    modes: ['fresh', 'retry'],
  },
  {
    key: 'admin:cluster-backfill',
    label: '관련기사 다시 묶기',
    endpoint: '/api/admin/cluster-backfill',
    usesLlm: false,
    surface: 'data',
    kind: 'loop',
    method: 'POST',
    limit: 20,
  },
  {
    key: 'admin:youtube-tagging',
    label: '기존 유튜브 태그 생성',
    endpoint: '/api/admin/youtube-tagging',
    usesLlm: false,
    surface: 'data',
    kind: 'once',
    method: 'POST',
    confirm: '기존 유튜브 콘텐츠(최대 100건)에 해시태그·관련 엔티티 태깅을 생성하시겠습니까?',
  },
]

for (const job of ENRICH_JOBS) {
  if (job.usesLlm !== (job.surface === 'ai')) {
    throw new Error(`[enrich-jobs] ${job.key}: usesLlm=${job.usesLlm} 인데 surface=${job.surface} 입니다.`)
  }
  if (job.kind === 'once' && job.limit !== undefined) {
    throw new Error(`[enrich-jobs] ${job.key}: 단발 작업에는 limit을 지정할 수 없습니다.`)
  }
  if (job.kind === 'loop' && job.limit === undefined) {
    throw new Error(`[enrich-jobs] ${job.key}: 반복 작업에는 limit이 필요합니다.`)
  }
  if (job.modes && job.kind !== 'loop') {
    throw new Error(`[enrich-jobs] ${job.key}: 실행 모드는 반복 작업에서만 사용할 수 있습니다.`)
  }
  if (job.dateRange && job.key !== 'admin:body-backfill') {
    throw new Error(`[enrich-jobs] ${job.key}: 날짜 범위는 본문 수집 작업에서만 사용할 수 있습니다.`)
  }
}

const keys = new Set<EnrichJobKey>()
for (const job of ENRICH_JOBS) {
  if (keys.has(job.key)) {
    throw new Error(`[enrich-jobs] ${job.key}: 중복된 작업 키입니다.`)
  }
  keys.add(job.key)
}

function requireRecord(json: unknown, key: EnrichJobKey): Record<string, unknown> {
  if (!json || typeof json !== 'object' || Array.isArray(json)) {
    throw new Error(`[enrich-jobs] ${key}: 응답이 객체가 아닙니다.`)
  }
  return json as Record<string, unknown>
}

function requireNumber(record: Record<string, unknown>, field: string, key: EnrichJobKey): number {
  const value = record[field]
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`[enrich-jobs] ${key}: 응답의 ${field} 값이 올바른 숫자가 아닙니다.`)
  }
  return value
}

function normalizeLoopResult(
  key: EnrichJobKey,
  record: Record<string, unknown>,
  succeededField: string,
  skippedField?: string,
  extraFields: string[] = [],
): EnrichJobResult {
  const ready = record.ready === undefined ? true : record.ready
  if (typeof ready !== 'boolean') {
    throw new Error(`[enrich-jobs] ${key}: 응답의 ready 값이 boolean이 아닙니다.`)
  }

  const extra = Object.fromEntries(
    extraFields.map((field) => [field, requireNumber(record, field, key)]),
  )

  return {
    processed: requireNumber(record, 'processed', key),
    succeeded: requireNumber(record, succeededField, key),
    skipped: skippedField ? requireNumber(record, skippedField, key) : 0,
    remaining: requireNumber(record, 'remaining', key),
    ready,
    ...(extraFields.length > 0 ? { extra } : {}),
  }
}

export function normalizeEnrichResult(key: EnrichJobKey, json: unknown): EnrichJobResult {
  const record = requireRecord(json, key)

  switch (key) {
    case 'admin:body-backfill':
      return normalizeLoopResult(key, record, 'improved', 'skipped')
    case 'admin:summary-backfill':
      return normalizeLoopResult(key, record, 'filled', 'skipped', ['notReady'])
    case 'admin:signals-backfill':
      return normalizeLoopResult(key, record, 'tagged')
    case 'admin:thumbnail-backfill':
    case 'admin:pdf-cover-backfill':
      return normalizeLoopResult(key, record, 'filled', 'skipped')
    case 'admin:youtube-transcript':
      return normalizeLoopResult(key, record, 'fetched', 'skipped')
    case 'admin:canonical-backfill':
      return normalizeLoopResult(key, record, 'resolved', undefined, ['deduped'])
    case 'admin:cluster-backfill':
      return normalizeLoopResult(key, record, 'merged', undefined, ['repChanged'])
    case 'admin:sentiment':
    case 'admin:lgu-impact':
    case 'admin:youtube-summary':
    case 'admin:youtube-tagging': {
      const processed = requireNumber(record, 'candidates', key)
      const succeeded = requireNumber(record, 'analyzed', key)
      return {
        processed,
        succeeded,
        skipped: Math.max(0, processed - succeeded),
        remaining: null,
        ready: true,
      }
    }
  }
}

export function getEnrichJob(key: EnrichJobKey): EnrichJobMeta {
  const job = ENRICH_JOBS.find((item) => item.key === key)
  if (!job) throw new Error(`[enrich-jobs] ${key}: 작업 메타가 없습니다.`)
  return job
}

export function getEnrichJobs(surface: EnrichJobSurface): EnrichJobMeta[] {
  return ENRICH_JOBS.filter((job) => job.surface === surface)
}

export function requireEnrichJob(
  jobs: readonly EnrichJobMeta[],
  key: EnrichJobKey,
  surface: EnrichJobSurface,
): EnrichJobMeta {
  const job = jobs.find((item) => item.key === key)
  if (!job) {
    throw new Error(`[enrich-jobs] ${surface} 화면에 ${key} 작업 메타가 없습니다.`)
  }
  if (job.surface !== surface) {
    throw new Error(`[enrich-jobs] ${key}: surface=${job.surface} 인데 ${surface} 화면에서 렌더링했습니다.`)
  }
  return job
}
