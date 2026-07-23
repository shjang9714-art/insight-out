/**
 * 뉴스레터 주식·증권·개인투자 콘텐츠 전면 제외 필터(지시서 20260723).
 *
 * STEP 0 조사 결과: `contents.category` enum에는 증권/주식 전용 값이 없다
 * (실제 운영 데이터는 뉴스/유튜브/리포트/웹인사이트뿐이고, 증권 기사도 전부
 * '뉴스' 카테고리로 들어온다). 따라서 카테고리 매핑 제외는 적용 대상이 없고,
 * 제목+요약 키워드 매칭이 사실상 유일한 실질 필터다.
 *
 * "투자" 단독 키워드는 의도적으로 제외 목록에 넣지 않는다 — 통신 설비/인프라
 * 투자(CapEx) 기사까지 오탐 제외되는 것을 막기 위함(지시서 STEP 1-3 명시 사항).
 */

// 관리자가 추후 조정하기 쉽도록 배열 상수로 분리.
export const STOCK_EXCLUDE_KEYWORDS: readonly string[] = [
  '증권', '증시', '주가', '주식', '코스피', '코스닥', '나스닥', '상장', 'IPO', '공모주',
  '배당', '종목', '매수', '매도', '목표주가', 'ETF', '유언대용신탁', '자산관리',
  '투자자문', '리딩방', '수익률', '시세', '급등주', '테마주',
  // 개인 투자상품 맥락의 "펀드"만(2026-07-23 2차 후속) — 단독 '펀드'는 부분 문자열
  // 매칭 특성상 벤처펀드·모펀드·사모펀드·블라인드펀드·인프라펀드 같은 법인/기관 펀드
  // 조성 기사(산업·B2B 성격)까지 걸려 제거함. 개인 투자상품 기사는 수익률·종목·배당
  // 등 다른 키워드에도 걸리는 경우가 많아 이중 안전망이 있다 — 과소제외 쪽으로 기움.
  '적립식펀드', '공모펀드', '연금펀드', '채권형펀드', '펀드 가입', '펀드 환매', 'TDF',
  // 개미투자·종목추천 톤(2026-07-23 후속) — "서학개미 올라탈 새 유니콘" 류가 위 목록에
  // 안 걸려 통과된 사례 발견. 급등주·테마주는 이미 위에 있어 중복 추가하지 않음.
  '서학개미', '동학개미', '유망주', '관심종목', '목표가', '저평가주',
  '배당주', '우선주', '상한가', '하한가', '불기둥', '존버', '익절', '손절',
  // "대박"/"떡상"/"떡락" 단독은 투자 아닌 맥락(제품 흥행 등)에도 흔히 쓰여 오탐 위험 —
  // "대박"은 구문으로만, "떡상"/"떡락"은 투자 은어로만 쓰이는 표현이라 단독 등재.
  '대박 터졌다', '떡상', '떡락',
]

// 실제 운영 카테고리 값에는 증권 전용 값이 없다(STEP 0 확인) — 향후 카테고리가
// 세분화될 경우를 대비해 자리만 남겨둔다. 현재는 항상 빈 결과.
const STOCK_EXCLUDE_CATEGORIES: readonly string[] = []

export interface FilterableContent {
  id: string
  title: string
  category: string | null
  summary_ko?: string | null
}

export interface FilterResult<T extends FilterableContent> {
  kept: T[]
  excluded: { content: T; reason: string }[]
}

function normalize(text: string): string {
  return text.toLowerCase().replace(/\s+/g, '')
}

/** 단일 콘텐츠가 주식·증권 계열인지 판정. 매칭되면 제외 사유 문자열, 아니면 null. */
export function detectStockExclusionReason(content: FilterableContent): string | null {
  if (content.category && STOCK_EXCLUDE_CATEGORIES.includes(content.category)) {
    return `카테고리:${content.category}`
  }

  const haystack = normalize(`${content.title} ${content.summary_ko ?? ''}`)
  for (const keyword of STOCK_EXCLUDE_KEYWORDS) {
    if (haystack.includes(normalize(keyword))) {
      return `키워드:${keyword}`
    }
  }

  return null
}

/** 콘텐츠 배열에서 주식·증권 콘텐츠를 제외하고, 제외 목록은 사유와 함께 console.log로 남긴다. */
export function filterOutStockContent<T extends FilterableContent>(contents: T[]): FilterResult<T> {
  const kept: T[] = []
  const excluded: { content: T; reason: string }[] = []

  for (const content of contents) {
    const reason = detectStockExclusionReason(content)
    if (reason) {
      excluded.push({ content, reason })
      console.log(`[뉴스레터/주식필터] 제외: "${content.title}" (${reason})`)
    } else {
      kept.push(content)
    }
  }

  return { kept, excluded }
}
