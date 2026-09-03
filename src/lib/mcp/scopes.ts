// 190 — MCP 스코프 정의 (클라이언트·서버 공용)
//
// ⚠️ 이 파일은 어드민 화면(클라이언트 컴포넌트)에서도 import 한다.
// 따라서 node:crypto / service_role 클라이언트를 절대 끌어오면 안 된다.
// 서버 전용 로직은 @/lib/mcp/auth 에 둔다.
//
// 'insights' 스코프는 보류 상태다(190 후속 결정):
//   key_insights 주간 파이프라인이 9e10230 에서 폐기되며 이를 읽는 화면이 0개가 됐다.
//   쓸 곳이 정해지기 전까지 스코프를 노출하면, 아무 툴도 딸려오지 않는 빈 권한을
//   발급하게 된다. 인사이트 지면을 정한 뒤 툴과 함께 되살릴 것.

export const MCP_SCOPES = ['read', 'ops', 'reports', 'publish', 'bookmark'] as const
export type McpScope = (typeof MCP_SCOPES)[number]

// DB enum content_category 와 1:1. types.ts 의 ContentCategory 와 다르다(UI 값 포함).
// DB enum 이 바뀌면 여기도 바꾼다.
export const MCP_CONTENT_CATEGORIES = [
  '뉴스',
  '가트너',
  'KRG',
  '웹인사이트',
  '오피니언',
  '뉴스레터',
  'AI보고서',
  '유튜브',
  '리포트',
  '기업자료',
  '지식보고서',
] as const

export const MCP_SCOPE_LABEL: Record<McpScope, string> = {
  read:     '조회·검색',
  ops:      '작업기록',
  reports:  '전략보고서',
  publish:  '즉시 발행',
  bookmark: '북마크',
}

export const MCP_SCOPE_DESC: Record<McpScope, string> = {
  read:     '콘텐츠·이슈·기업 검색 및 조회 (보고서의 근거를 찾는 데 필수)',
  ops:      '작업계획/결과, 요청·공지 등록·수정',
  reports:  '전략보고서 초안 작성·수정',
  publish:  '검토 없이 서비스에 즉시 노출되는 상태로 저장 허용 — 신중히 부여',
  bookmark: '기사를 토큰 계정의 북마크에 담고 조회 (개인 컬렉션 쓰기)',
}
