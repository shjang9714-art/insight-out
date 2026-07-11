import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import { jaccardSimilarity } from '@/lib/daily-insights/dedupe'
import type { DailyInsightCategory } from '@/lib/daily-insights/constants'

// 과거기사(related_past) 관련성 필터 — candidates.ts 의 이슈 클러스터 과다연결 노이즈가
// 그대로 pass-through 되면(예: AI 에이전트 인사이트에 부동산·무관규제 기사가 딸려오는 문제),
// "같은 이슈에 링크돼 있다"는 사실만으로는 관련성 보증이 안 된다. candidates.ts 는 건드리지
// 않는다는 제약이 있어, 그 파일의 assignCategory 와 동일한 판정 로직(엔티티→보안→키워드그룹
// 매핑)을 여기서 독립적으로 재구현해 "과거기사 자신의" 카테고리를 다시 계산한다 — 부모 후보의
// suggestedCategory 를 그대로 물려받으면 한 그룹 내 멤버는 항상 그룹 카테고리와 일치해
// 필터가 무력화되므로, 반드시 과거기사 자신의 matched_groups/entities 로 재판정해야 한다.

const GROUP_NAME_TO_CATEGORY: Record<string, DailyInsightCategory> = {
  'AIDC': 'AIDC·클라우드',
  'AICC': 'AICC·비즈콜',
  '통신 B2B': '통신사업·커넥티비티',
  '모빌리티': '통신사업·커넥티비티',
  'CCTV·영상보안': '통신사업·커넥티비티',
  '정부 사업': '정책·정부',
  '정부 규제': '정책·정부',
  '빅테크': '빅테크·One LG',
}
const SECURITY_GROUP_NAME = '사이버보안'
const TELECOM_COMPANY_NAMES = ['LG유플러스', 'SKT', 'KT', 'SK브로드밴드'] as const

/** 과거기사 content_id → (재판정한) 카테고리. 판정 불가(매칭 없음)는 null. */
export async function classifyPastArticleCategories(
  contentIds: string[]
): Promise<Map<string, DailyInsightCategory | null>> {
  const result = new Map<string, DailyInsightCategory | null>()
  if (contentIds.length === 0) return result

  const admin = createAdminClient()
  const [{ data: contentRows }, { data: telecomEntities }] = await Promise.all([
    admin.from('contents').select('id, matched_groups').in('id', contentIds),
    admin.from('entities').select('id, canonical_name').in('canonical_name', [...TELECOM_COMPANY_NAMES]),
  ])

  const telecomEntityIds = (telecomEntities ?? []).map((e) => e.id as string)
  const { data: entityHits } = telecomEntityIds.length
    ? await admin
        .from('content_entities')
        .select('content_id, entity_id')
        .in('content_id', contentIds)
        .in('entity_id', telecomEntityIds)
    : { data: [] as { content_id: string; entity_id: string }[] }

  const hasTelecomEntity = new Set((entityHits ?? []).map((r) => r.content_id as string))

  for (const row of contentRows ?? []) {
    const groups: string[] = row.matched_groups ?? []
    let category: DailyInsightCategory | null = null

    if (hasTelecomEntity.has(row.id)) {
      category = '자사·통신사 동향'
    } else if (groups.includes(SECURITY_GROUP_NAME)) {
      category = '사이버보안'
    } else {
      for (const g of groups) {
        const mapped = GROUP_NAME_TO_CATEGORY[g]
        if (mapped) {
          category = mapped
          break
        }
      }
    }

    result.set(row.id, category)
  }

  return result
}

// ─── 제목 토큰 자카드 유사도(관련성용) ──────────────────────────────────────────
// dedupe.ts 의 titleTokens 는 근접중복 판정용(숫자·수치도 구분 신호로 유지)이라 그대로 못 쓴다.
// 관련성 판정은 더 느슨해야 하므로 불용어·연도·순수 숫자 토큰을 추가로 제거한다.

const PUNCT_RE = /["'“”‘’.,!?…()\[\]{}·:;\-–—/\\|%]/g
const PURE_NUMBER_RE = /^[0-9]+(년|월|일|위|건|개|명|조|억|만|배)?$/
const STOPWORDS = new Set([
  '것으로', '것이다', '있다', '없다', '한다', '했다', '된다', '됐다',
  '대한', '대해', '위해', '통해', '가운데', '한편', '오늘', '최근', '지난', '이날', '이번',
  '관련', '속', '등', '및', '또', '또한', '이후', '전망', '예정', '계획', '발표',
  '추진', '단행', '확대', '강화', '가속', '가속화', '모색', '대응',
])

function relevanceTokens(title: string): Set<string> {
  const normalized = title.replace(PUNCT_RE, ' ').replace(/\s+/g, ' ').trim().toLowerCase()
  const tokens = normalized.split(' ').filter((t) => t.length > 0 && !PURE_NUMBER_RE.test(t) && !STOPWORDS.has(t))
  return new Set(tokens)
}

/** 시작값 — 필요시 운영 관찰하며 0.12~0.15 범위에서 조정. */
export const RELEVANCE_JACCARD_THRESHOLD = 0.13

export interface RelevanceCheckInput {
  title: string
  category: DailyInsightCategory | null
}

/**
 * 과거기사 통과 조건(하나 이상): (1) 카테고리가 인사이트 카테고리와 일치, 또는
 * (2) 제목 토큰 자카드 유사도가 인사이트 headline·근거기사 제목들 중 하나와 임계값 이상.
 * 이슈 링크만으로는 통과 불가(호출부가 애초에 이슈 링크 유무와 무관하게 이 함수로만 판단).
 */
export function isRelevantPastArticle(
  past: RelevanceCheckInput,
  insightCategory: string | null,
  referenceTitles: readonly string[]
): boolean {
  if (insightCategory && past.category === insightCategory) return true

  const pastTokens = relevanceTokens(past.title)
  if (pastTokens.size === 0) return false

  return referenceTitles.some((ref) => jaccardSimilarity(pastTokens, relevanceTokens(ref)) >= RELEVANCE_JACCARD_THRESHOLD)
}
