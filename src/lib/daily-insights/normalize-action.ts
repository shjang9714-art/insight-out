// implication_lenses.action 렌더 정규화 — 구버전 라이브 데이터에 남아있는 팀 주어 제거(재생성 없이 표시 단계에서 처리).
// 문장 맨 앞이 "○○팀"+조사(은/는/이/가/에서는/에서)로 시작할 때만 그 어절을 제거한다.
// 팀명이 "B2B 영업팀은"처럼 공백 섞인 2~3어절인 실제 라이브 데이터 패턴도 커버하되, 폭주 매칭을 막기 위해
// 팀명 앞쪽 단어 수는 최대 3개로 제한한다. 문장 중간의 팀명은 건드리지 않고, 패턴이 맞지 않으면 원문을 그대로 반환한다.
const LEADING_TEAM_SUBJECT = /^(?:[가-힣A-Za-z0-9·/]+\s){0,2}[가-힣A-Za-z0-9·/]+팀(은|는|이|가|에서는|에서)\s*/

/** action 필드를 렌더할 때(홈·상세·뉴스레터 공통) 반드시 이 유틸을 거친다. */
export function stripActionTeamSubject(text: string): string {
  return text.replace(LEADING_TEAM_SUBJECT, '')
}
