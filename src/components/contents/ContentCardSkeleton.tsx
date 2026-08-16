// 394 — ContentCard(src/components/dashboard/ContentCard.tsx)의 실제 DOM 구조를 그대로 따르는
// 공용 스켈레톤. contents/loading.tsx · ContentsBoard.tsx 양쪽이 이 컴포넌트만 쓴다(모양 정의 단일화).
// 막대 길이는 index로 결정되는 고정 패턴(랜덤 금지 — 하이드레이션 불일치 방지).
// 510 — ContentCard·ContentListCard 카드 내부 계약(표지 16:9 + 배지 1줄 + 태그 1줄 + 제목 2줄 +
// 요약 2줄 + 메타 1줄)이 통일됐으므로 스켈레톤도 이 한 가지 모양만 흉내 내면 두 카드 어디서
// 쓰이든(웹인사이트 등) 로딩→완료 전환 시 레이아웃이 튀지 않는다.

import { CARD_BADGE_ROW_CLASS, CARD_PADDING_CLASS, CARD_TAG_ROW_CLASS } from '@/lib/contents/card-contract'

interface Pattern {
  badges: number
  tags: number
  titleWidths: [string, string]
  summaryWidths: [string, string]
}

const PATTERNS: Pattern[] = [
  { badges: 2, tags: 2, titleWidths: ['w-full', 'w-4/5'], summaryWidths: ['w-full', 'w-3/4'] },
  { badges: 3, tags: 3, titleWidths: ['w-11/12', 'w-2/3'], summaryWidths: ['w-full', 'w-1/2'] },
  { badges: 2, tags: 0, titleWidths: ['w-full', 'w-3/4'], summaryWidths: ['w-5/6', 'w-full'] },
  { badges: 3, tags: 2, titleWidths: ['w-4/5', 'w-1/2'], summaryWidths: ['w-full', 'w-2/3'] },
]

export default function ContentCardSkeleton({ index = 0 }: { index?: number }) {
  const p = PATTERNS[index % PATTERNS.length]

  return (
    <div className={`flex h-full flex-col rounded-2xl border border-border bg-card overflow-hidden`}>
      <div className="aspect-[16/9] bg-muted animate-pulse" />
      <div className={`flex flex-1 flex-col ${CARD_PADDING_CLASS}`}>
        {/* 배지 1줄 */}
        <div className={CARD_BADGE_ROW_CLASS}>
          {Array.from({ length: p.badges }).map((_, i) => (
            <div key={i} className="h-[18px] w-14 shrink-0 rounded-full bg-muted animate-pulse" />
          ))}
        </div>

        {/* 태그 1줄 — 값이 없어도 항상 렌더되는 실제 카드와 동일하게 항상 자리를 예약한다 */}
        <div className={CARD_TAG_ROW_CLASS}>
          {Array.from({ length: p.tags }).map((_, i) => (
            <div key={i} className="h-[18px] w-11 shrink-0 rounded-full bg-muted animate-pulse" />
          ))}
        </div>

        {/* 제목 2줄 */}
        <div className={`mb-1.5 h-3.5 rounded bg-muted animate-pulse ${p.titleWidths[0]}`} />
        <div className={`mb-2 h-3.5 rounded bg-muted animate-pulse ${p.titleWidths[1]}`} />

        {/* 요약 2줄 */}
        <div className={`mb-1 h-3 rounded bg-muted animate-pulse ${p.summaryWidths[0]}`} />
        <div className={`mb-2 h-3 rounded bg-muted animate-pulse ${p.summaryWidths[1]}`} />

        {/* 메타 1줄 */}
        <div className="mt-auto h-3 w-20 rounded bg-muted animate-pulse" />
      </div>
    </div>
  )
}
