// 지시서 281 — 실제 썸네일이 없는 콘텐츠 카드에 주제 매칭 생성 커버를 폴백으로 선택한다.
// 폴백 체인: 실제 썸네일 > (og:image) > 생성 풀(이번) > BrandedCover(카드 컴포넌트 내장).

import { TOPIC_COVER_POOL } from './topic-cover-manifest.generated'

// 파일 rawKey(변형접미 제거 후, NFC 정규화) → 매칭 대상 canonical.
// 매니페스트 생성 시점(scripts/build-topic-cover-manifest.mjs)에 이미 적용되어 TOPIC_COVER_POOL 키가
// canonical 형태로 저장돼 있다 — 여기서는 문서화·참조용 단일 소스(빌드 스크립트와 동일하게 유지할 것).
export const ALIAS: Record<string, string> = {
  'AI기술': 'AI 기술',
  '통신 b2b': '통신 B2B',
  '피지컬ai': '피지컬 AI',
  '제조dx': '제조 DX',
  '정부규제': '정부 규제',
  cctv: 'CCTV·영상보안',
  sme: 'SME 솔루션',
  'sme,soho': 'SME 솔루션',
  IT: 'IT 동향',
  ai보고서: 'AI보고서',
  '전략보고서 표지': '전략보고서',
  esg: 'ESG',
}

/** 비교용 정규화: NFC + trim + 소문자 + 내부 공백/구두점 제거 (양쪽에 적용해 매칭 견고화) */
function normalize(s: string): string {
  return s.normalize('NFC').trim().toLowerCase().replace(/[\s·,.\-_/]+/g, '')
}

const NORMALIZED_POOL: Record<string, string[]> = {}
for (const [key, urls] of Object.entries(TOPIC_COVER_POOL)) {
  NORMALIZED_POOL[normalize(key)] = urls
}

/** 문자열 안정 해시(FNV-1a 변형) — 같은 id → 같은 인덱스(회전 없음, 깜빡임 방지) */
function hashIndex(id: string, length: number): number {
  let hash = 0
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) | 0
  }
  return Math.abs(hash) % length
}

interface PickTopicCoverInput {
  id: string
  matchedGroups?: string[] | null
  matchedKeywords?: string[] | null
  category?: string | null
}

/**
 * matched_groups → matched_keywords → category 우선순위로 TOPIC_COVER_POOL 매칭.
 * 매칭되면 id 해시로 같은 그룹 내 이미지 중 1장을 고정 선택. 매칭 없으면 null(BrandedCover 폴백).
 */
export function pickTopicCover({ id, matchedGroups, matchedKeywords, category }: PickTopicCoverInput): string | null {
  const candidates = [
    ...(matchedGroups ?? []),
    ...(matchedKeywords ?? []),
    ...(category ? [category] : []),
  ]

  for (const candidate of candidates) {
    if (!candidate) continue
    const urls = NORMALIZED_POOL[normalize(candidate)]
    if (urls && urls.length > 0) {
      return urls[hashIndex(id, urls.length)]
    }
  }
  return null
}

interface CoverRow {
  id: string
  thumbnail_url?: string | null
  matched_groups?: string[] | null
  matched_keywords?: string[] | null
  category?: string | null
}

/** 카드 thumbnailUrl 로 바로 넘길 값. 실제 썸네일 우선, 없으면 주제 매칭 생성 커버, 그것도 없으면 null(카드가 BrandedCover 렌더). */
export function coverUrlFor(row: CoverRow): string | null {
  return row.thumbnail_url ?? pickTopicCover({
    id: row.id,
    matchedGroups: row.matched_groups,
    matchedKeywords: row.matched_keywords,
    category: row.category,
  }) ?? null
}
