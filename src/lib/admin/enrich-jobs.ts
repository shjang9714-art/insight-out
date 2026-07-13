export type EnrichJobSurface = 'ai' | 'data'

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
}

export const ENRICH_JOBS: EnrichJobMeta[] = [
  {
    key: 'admin:sentiment',
    label: '논조 분석',
    endpoint: '/api/admin/sentiment',
    usesLlm: true,
    surface: 'ai',
  },
  {
    key: 'admin:lgu-impact',
    label: '위기·기회 분석',
    endpoint: '/api/admin/lgu-impact',
    usesLlm: true,
    surface: 'ai',
  },
  {
    key: 'admin:youtube-summary',
    label: '유튜브 요약 생성',
    endpoint: '/api/admin/youtube-summary',
    usesLlm: true,
    surface: 'ai',
  },
  {
    key: 'admin:summary-backfill',
    label: '뉴스 요약 백필',
    endpoint: '/api/admin/summary-backfill',
    usesLlm: true,
    surface: 'ai',
  },
  {
    key: 'admin:signals-backfill',
    label: '신호 분류',
    endpoint: '/api/admin/signals-backfill',
    usesLlm: true,
    surface: 'ai',
  },
  {
    key: 'admin:body-backfill',
    label: '누락 기사 본문 수집',
    endpoint: '/api/admin/body-backfill',
    usesLlm: false,
    surface: 'data',
  },
  {
    key: 'admin:canonical-backfill',
    label: '원문 URL 정규화',
    endpoint: '/api/admin/canonical-backfill',
    usesLlm: false,
    surface: 'data',
  },
  {
    key: 'admin:thumbnail-backfill',
    label: '누락 썸네일 다시 수집',
    endpoint: '/api/admin/thumbnail-backfill',
    usesLlm: false,
    surface: 'data',
  },
  {
    key: 'admin:youtube-transcript',
    label: '유튜브 자막 수집',
    endpoint: '/api/admin/youtube-transcript',
    usesLlm: false,
    surface: 'data',
  },
  {
    key: 'admin:pdf-cover-backfill',
    label: 'PDF 표지 수집',
    endpoint: '/api/admin/pdf-cover-backfill',
    usesLlm: false,
    surface: 'data',
  },
  {
    key: 'admin:cluster-backfill',
    label: '관련기사 다시 묶기',
    endpoint: '/api/admin/cluster-backfill',
    usesLlm: false,
    surface: 'data',
  },
  {
    key: 'admin:youtube-tagging',
    label: '기존 유튜브 태그 생성',
    endpoint: '/api/admin/youtube-tagging',
    usesLlm: false,
    surface: 'data',
  },
]

for (const job of ENRICH_JOBS) {
  if (job.usesLlm !== (job.surface === 'ai')) {
    throw new Error(`[enrich-jobs] ${job.key}: usesLlm=${job.usesLlm} 인데 surface=${job.surface} 입니다.`)
  }
}

const keys = new Set<EnrichJobKey>()
for (const job of ENRICH_JOBS) {
  if (keys.has(job.key)) {
    throw new Error(`[enrich-jobs] ${job.key}: 중복된 작업 키입니다.`)
  }
  keys.add(job.key)
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
