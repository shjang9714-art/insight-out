// 지시서 281 — 실제 썸네일이 없는 콘텐츠 카드에 주제 매칭 생성 커버를 폴백으로 선택한다.
// 폴백 체인: 실제 썸네일 > (og:image) > 생성 풀(이번) > BrandedCover(카드 컴포넌트 내장).

import { TOPIC_COVER_POOL } from './topic-cover-manifest.generated'
import { resolveStorageUrl } from '@/lib/storage/resolve-url'

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

/**
 * 토픽 선택 우선순위(288) — 작을수록 먼저(더 구체적 = 기사 주제를 잘 대표).
 * 'AI 기술'·'IT 동향'은 거의 모든 기술 기사에 붙는 우산 태그라, 구체 토픽이 있으면 양보시킨다.
 * 미등재 키는 DEFAULT_PRIORITY(구체 토픽으로 간주 — 우산 토픽만 명시적으로 낮춘다).
 */
const TOPIC_PRIORITY: Record<string, number> = {
  // 1) 엔티티 — 가장 구체적
  '도요타': 1,
  '현대자동차': 1,

  // 2) 구체 도메인 — 기사 주제를 잘 대표
  '반도체': 2,
  'AIDC': 2,
  'AICC': 2,
  '모빌리티': 2,
  '통신 B2B': 2,
  '제조 DX': 2,
  'CCTV·영상보안': 2,
  'SME 솔루션': 2,
  '피지컬 AI': 2,
  '클라우드': 2,
  '에너지': 2,
  'ESG': 2,
  '정부 규제': 2,

  // 3) 우산 토픽 — 구체 토픽이 없을 때만
  'AI 기술': 8,
  'IT 동향': 8,

  // 4) 카테고리·문서종류 — 최후
  '뉴스': 9,
  '웹인사이트': 9,
  '리포트': 9,
  'AI보고서': 9,
  '전략보고서': 9,
}

const DEFAULT_PRIORITY = 3 // 미등재 = 구체 토픽 취급(우산 토픽만 명시적으로 낮춘다)

// normalize()를 우선순위 조회에도 동일 적용 — 'AI기술'/'AI 기술' 표기차로 조용히 무시되는 것 방지(288).
const NORMALIZED_PRIORITY: Record<string, number> = {}
for (const [k, v] of Object.entries(TOPIC_PRIORITY)) NORMALIZED_PRIORITY[normalize(k)] = v

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
 * matched_groups/matched_keywords/category 중 TOPIC_COVER_POOL에 풀이 있는 후보를
 * 구체성 우선순위(TOPIC_PRIORITY, 288)로 정렬해 가장 구체적인 토픽을 선택한다.
 * 동순위면 원래(매칭된) 순서를 유지(안정 정렬). 매칭되면 id 해시로 같은 그룹 내
 * 이미지 중 1장을 고정 선택. 매칭 없으면 null(BrandedCover 폴백).
 */
export function pickTopicCover({ id, matchedGroups, matchedKeywords, category }: PickTopicCoverInput): string | null {
  const candidates = [
    ...(matchedGroups ?? []),
    ...(matchedKeywords ?? []),
    ...(category ? [category] : []),
  ].filter(Boolean) as string[]

  // 풀이 있는 후보만 남기고, (우선순위 → 원래 순서)로 안정 정렬
  const matched = candidates
    .map((c, i) => ({ i, urls: NORMALIZED_POOL[normalize(c)], priority: NORMALIZED_PRIORITY[normalize(c)] ?? DEFAULT_PRIORITY }))
    .filter((x): x is { i: number; urls: string[]; priority: number } => Boolean(x.urls) && x.urls.length > 0)
    .sort((a, b) => a.priority - b.priority || a.i - b.i)

  const best = matched[0]
  if (!best) return null
  return best.urls[hashIndex(id, best.urls.length)]
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
  return resolveStorageUrl(row.thumbnail_url ?? null) ?? pickTopicCover({
    id: row.id,
    matchedGroups: row.matched_groups,
    matchedKeywords: row.matched_keywords,
    category: row.category,
  }) ?? null
}
