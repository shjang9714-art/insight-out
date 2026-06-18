export type TagBucket = '기술' | '시장·정책' | '업체' | '일반'

export function tagTypeToBucket(t: string | null | undefined): TagBucket {
  if (t === 'tech') return '기술'
  if (t === 'market' || t === 'policy') return '시장·정책'
  if (t === 'company') return '업체'
  return '일반'
}

export const TAG_BUCKETS: TagBucket[] = ['기술', '시장·정책', '업체', '일반']
