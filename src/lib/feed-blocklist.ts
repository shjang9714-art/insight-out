/**
 * 홈 피드 노출 레이어 블록리스트 — B2B M.I와 무관한 콘텐츠 필터
 *
 * ⚠️ 수집 레이어(crawler)는 건드리지 않음. 화면 노출 단계에서만 적용.
 * ⚠️ RELATEDNESS_GATING_ENABLED 값은 이 파일과 무관하며 변경 금지.
 */

/** e스포츠/게임 키워드 */
const ESPORTS_KEYWORDS = [
  '젠지', 'T1', 'LoL', '리그오브레전드', 'MSI', '롤드컵', 'LCK',
  'e스포츠', '이스포츠', '게임단', '프로게이머', '서머스플릿',
  '게임 출시', '게임 개발', '게임사', '모바일게임', '온라인게임',
  '배틀그라운드', '오버워치', '발로란트', '스타크래프트', 'DRX',
]

/** 부동산/주거 키워드 */
const REALESTATE_KEYWORDS = [
  '아파트값', '아파트 매매', '전세', '분양', '재건축', '재개발',
  '임대차', '월세', '집값', '부동산 시장', '공시지가', '주택담보',
  '갭투자', '청약', '입주물량', '강서 매매',
]

/** 연예/스포츠/일반 소비자 키워드 */
const ENTERTAINMENT_KEYWORDS = [
  '아이돌', '콘서트', '드라마 시청률', '영화 흥행', '박스오피스',
  '야구 순위', '축구 결과', '골프', '수영', '마라톤', '올림픽 메달',
  '연예인', '팬미팅', '데뷔 앨범', 'OST',
]

/** 통신 B2C 키워드 — 모닝브리핑 후보에서 소비자向 기사 제외 */
const TELECOM_B2C_KEYWORDS = [
  '요금제', '데이터 무제한', '알뜰폰', '번호이동', '약정 할인',
  '단말 보조금', '단말기 유통', '공시 지원금', '자급제',
  '가입자 유치', '소비자 프로모션', 'MVNO',
  '멤버십 혜택', '포인트 적립', '통신비 할인',
]

/** 통합 블록리스트 */
export const FEED_BLOCKLIST: string[] = [
  ...ESPORTS_KEYWORDS,
  ...REALESTATE_KEYWORDS,
  ...ENTERTAINMENT_KEYWORDS,
]

/** 브리핑용 확장 블록리스트 (기본 블록리스트 + 통신 B2C) */
export const BRIEFING_BLOCKLIST: string[] = [
  ...FEED_BLOCKLIST,
  ...TELECOM_B2C_KEYWORDS,
]

/**
 * 시황·주가 칼럼 마커 — 모닝브리핑은 산업 알맹이(기술·딜·전략·정책)만 다룬다.
 * 주가·시총·증시 등락 중심 기사는 사실상 투자자用이라 브리핑 후보에서 제외.
 * 제목 기준(시황 칼럼은 제목에 신호가 뚜렷). 본문/요약은 보지 않아 과필터를 막는다.
 */
const STOCK_COLUMN_MARKERS = [
  '시총', '시가총액', '코스피', '코스닥', '증시', '시황',
  '급등', '급락', '상한가', '하한가', '목표주가', '관련주', '테마주',
  '특징주', '신고가', '신저가', '52주', '주가', "dd's톡",
]

/** 제목이 시황·주가 칼럼이면 true (브리핑 후보 제외용). */
export function isStockMarketHeavy(title: string): boolean {
  const t = (title ?? '').toLowerCase()
  return STOCK_COLUMN_MARKERS.some((kw) => t.includes(kw))
}

export function isBriefingRelevant(title: string, summaryKo: string | null): boolean {
  if (isStockMarketHeavy(title)) return false
  const text = (title + ' ' + (summaryKo ?? '')).toLowerCase()
  return !BRIEFING_BLOCKLIST.some((kw) => text.includes(kw.toLowerCase()))
}

/**
 * 제목 또는 요약에 블록 키워드가 포함된 경우 false를 반환.
 * 대소문자 구분 없음.
 */
export function isB2BRelevant(title: string, summaryKo: string | null): boolean {
  const text = (title + ' ' + (summaryKo ?? '')).toLowerCase()
  return !FEED_BLOCKLIST.some((kw) => text.includes(kw.toLowerCase()))
}
