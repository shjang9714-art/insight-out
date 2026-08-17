/** 510 — 콘텐츠 카드 격자 폭. ContentsBoard·대시보드 홈·로딩 스켈레톤·엔티티 패널 등
 *  여러 곳에서 같은 클래스 문자열이 중복돼 있었다(7곳 — entities/page.tsx 의 공시자료
 *  문서 카드 격자는 디자인이 달라 제외). 폭을 바꿀 일이 생기면 여기 한 곳만 고치면 된다. */
export const CONTENT_GRID_CLASS = 'grid gap-5 grid-cols-[repeat(auto-fill,minmax(300px,1fr))]'

/** 510 — ContentCard·ContentListCard 공용 카드 내부 계약. 해시태그·요약처럼 값이 있을 때만
 *  렌더되던 행 때문에 값 없는 카드만 제목이 위로 올라가 격자가 들쭉날쭉해 보였다. 두 카드
 *  모두 이 값으로 행을 "항상 렌더 + 고정 높이"로 맞춘다. */
export const CARD_PADDING_CLASS = 'p-4'
export const CARD_MAX_VISIBLE_TAGS = 3
// 배지 행 — 카테고리·LGU 임팩트·매체명 등. 한 줄 고정(매체명이 길면 truncate로 잘림).
export const CARD_BADGE_ROW_CLASS = 'mb-2 flex flex-nowrap items-center gap-1.5 overflow-hidden'
// 해시태그 행 — 값이 없어도 항상 렌더해 높이를 예약한다. 최대 CARD_MAX_VISIBLE_TAGS개 + "+N".
export const CARD_TAG_ROW_CLASS = 'mb-1.5 flex flex-nowrap items-center gap-1 overflow-hidden min-h-[22px]'
