export interface HomeSectionDef {
  key: string
  label: string
  description: string
}

/** 공개 홈(/dashboard) 섹션 레지스트리 — 코드가 진실의 원천, DB는 enabled·순서만 저장. */
export const HOME_SECTION_REGISTRY: HomeSectionDef[] = [
  {
    key: 'personalization_nudge',
    label: '맞춤 설정 유도 배너',
    description: '온보딩 미완 사용자 안내',
  },
  {
    key: 'visit_delta',
    label: '새 소식 배지',
    description: '지난 방문 이후 신규 콘텐츠·이슈 수',
  },
  {
    key: 'issue_signals',
    label: '트렌딩 이슈 티커',
    description: '오늘의 급상승 뉴스 스트립',
  },
  {
    key: 'briefing_highlights',
    label: '주목하세요, 핵심 Insight',
    description: 'AI가 뽑은 주간 핵심 Insight 3개',
  },
  {
    key: 'feed_slot',
    label: '맞춤 피드',
    description: '사용자 맞춤 콘텐츠 캐러셀',
  },
]
