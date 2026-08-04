// 실험실 탭 정의 — 서버/클라이언트 공용 순수 상수.
// 서버 컴포넌트가 'use client' 모듈의 런타임 값을 import하면 client reference가 되어
// 배열 메서드를 호출할 수 없으므로 이 파일은 클라이언트 경계 밖에 둔다.

export type LabViewId = 'headline' | 'trending' | 'issues' | 'council' | 'competitor' | 'trend'

export const LAB_TABS: { id: LabViewId; label: string }[] = [
  { id: 'headline', label: '헤드라인 분석' },
  { id: 'trending', label: '뜨는 토픽' },
  { id: 'issues', label: '이슈 타임라인' },
  { id: 'council', label: 'AI 협의체 (베타)' },
  // 지시서(2026-08-04, 카테고리 라벨/메뉴 정리 Stage): 기업동향 하위에서 이관.
  { id: 'competitor', label: '경쟁사 최근 뉴스' },
  { id: 'trend', label: '경쟁사 주간 브리핑' },
]

export const LAB_VIEW_IDS: readonly LabViewId[] = LAB_TABS.map((tab) => tab.id)
