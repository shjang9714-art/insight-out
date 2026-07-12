// 190 — MCP 스코프 정의 (클라이언트·서버 공용)
//
// ⚠️ 이 파일은 어드민 화면(클라이언트 컴포넌트)에서도 import 한다.
// 따라서 node:crypto / service_role 클라이언트를 절대 끌어오면 안 된다.
// 서버 전용 로직은 @/lib/mcp/auth 에 둔다.

export const MCP_SCOPES = ['read', 'ops', 'reports', 'insights', 'publish'] as const
export type McpScope = (typeof MCP_SCOPES)[number]

export const MCP_SCOPE_LABEL: Record<McpScope, string> = {
  read:     '조회·검색',
  ops:      '작업기록',
  reports:  '전략보고서',
  insights: '핵심인사이트',
  publish:  '즉시 발행',
}

export const MCP_SCOPE_DESC: Record<McpScope, string> = {
  read:     '콘텐츠·이슈·기업 검색 및 조회 (보고서의 근거를 찾는 데 필수)',
  ops:      '작업계획/결과, 요청·공지 등록·수정',
  reports:  '전략보고서 초안 작성·수정',
  insights: '핵심인사이트 카드 작성·수정',
  publish:  '검토 없이 서비스에 즉시 노출되는 상태로 저장 허용 — 신중히 부여',
}
