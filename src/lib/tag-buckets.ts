export type TagBucket = '기술' | '시장·정책' | '업체' | '일반'

export function tagTypeToBucket(t: string | null | undefined): TagBucket {
  if (t === 'tech') return '기술'
  if (t === 'market' || t === 'policy') return '시장·정책'
  if (t === 'company') return '업체'
  return '일반'
}

export const TAG_BUCKETS: TagBucket[] = ['기술', '시장·정책', '업체', '일반']

// 버킷별 저채도 칩 클래스 (범주 구분용, 상태색과 별도)
export const BUCKET_CHIP_CLS: Record<TagBucket, string> = {
  '기술':      'bg-blue-500/10 text-blue-600 dark:text-blue-400',
  '시장·정책': 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  '업체':      'bg-slate-500/10 text-slate-600 dark:text-slate-300',
  '일반':      'bg-muted text-muted-foreground',
}

// 버킷별 액센트 바 보더 클래스 (헤드라인 좌측 bar · 맥락 섹션 보더)
export const BUCKET_ACCENT_CLS: Record<TagBucket, string> = {
  '기술':      'border-blue-500/50',
  '시장·정책': 'border-amber-500/50',
  '업체':      'border-slate-500/50',
  '일반':      'border-brand-600/20',
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
}
