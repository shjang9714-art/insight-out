export type TagBucket = '기술·제품' | '기업·기관' | '시장·산업' | '정책·규제' | '그 외'

export function tagTypeToBucket(t: string | null | undefined): TagBucket {
  if (t === 'tech') return '기술·제품'
  if (t === 'company') return '기업·기관'
  if (t === 'market' || t === 'industry') return '시장·산업'
  if (t === 'policy') return '정책·규제'
  return '그 외'
}

export const TAG_BUCKETS: TagBucket[] = ['기술·제품', '기업·기관', '시장·산업', '정책·규제', '그 외']

// 버킷별 저채도 칩 클래스 (범주 구분용, 상태색과 별도)
export const BUCKET_CHIP_CLS: Record<TagBucket, string> = {
  '기술·제품': 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
  '기업·기관': 'bg-violet-500/10 text-violet-600 dark:text-violet-400',
  '시장·산업': 'bg-teal-500/10 text-teal-600 dark:text-teal-400',
  '정책·규제': 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  '그 외': 'bg-muted text-muted-foreground',
}

// 버킷별 액센트 바 보더 클래스 (헤드라인 좌측 bar · 맥락 섹션 보더)
export const BUCKET_ACCENT_CLS: Record<TagBucket, string> = {
  '기술·제품': 'border-blue-500/50',
  '기업·기관': 'border-violet-500/50',
  '시장·산업': 'border-teal-500/50',
  '정책·규제': 'border-amber-500/50',
  '그 외': 'border-border',
}

export const BUCKET_BAR_CLS: Record<TagBucket, string> = {
  '기술·제품': 'bg-blue-500',
  '기업·기관': 'bg-violet-500',
  '시장·산업': 'bg-teal-500',
  '정책·규제': 'bg-amber-500',
  '그 외': 'bg-muted-foreground/50',
}

export const BUCKET_DOT_CLS: Record<TagBucket, string> = {
  '기술·제품': 'bg-blue-500',
  '기업·기관': 'bg-violet-500',
  '시장·산업': 'bg-teal-500',
  '정책·규제': 'bg-amber-500',
  '그 외': 'bg-muted-foreground/50',
}

// KeywordMap에서 이동한 타입 (AiInsightsView 등에서 사용)
export interface KeywordItem {
  name: string
  count: number
  size: number
  bucket: TagBucket
  watched: boolean
  isCompetitor: boolean
  direction?: '▲' | '▽' | null
  changePct?: number
  cur?: number
  prev?: number
  isNew?: boolean
}
