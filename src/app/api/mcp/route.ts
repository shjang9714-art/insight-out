// 190 — 인사이트 아웃 MCP 서버 (/api/mcp)
//
// 목적: 팀원 각자의 Claude(Code/Desktop)가 인사이트 아웃에 직접 기록한다.
//   · 작업계획/결과   → ops_requests (post_type='work')
//   · 전략보고서      → ai_reports + ai_report_sources
//   · 근거 조회·검색  → contents / issues / entities
//
// 인사이트 툴은 보류(190 후속 결정):
//   9e10230 에서 key_insights 주간 파이프라인이 폐기되며 이를 읽는 화면·API 가 전부 사라졌다.
//   "핵심 인사이트" 지면은 daily_insights 가 가져갔고 key_insights 는 테이블만 남았다.
//   그 상태로 인사이트 툴을 두면 팀원이 카드를 써도 아무도 볼 수 없다 —
//   에러도 안 나고 빌드도 통과하는, 조용히 실패하는 최악의 형태.
//   인사이트 기록은 지면(daily_insights 통합 vs 별도 코너)을 먼저 정한 뒤 다시 붙인다.
//
// 인증(188 → 190 변경):
//   188 은 팀 공용 단일 MCP_TOKEN 하나였다. "누가 썼는지"를 알 수 없어
//   ai_reports.user_id(NOT NULL FK) 같은 테이블에는 애초에 쓸 수 없었다.
//   190 은 mcp_tokens 테이블로 1인 1토큰. 토큰 → user_id 가 확정되므로
//   작성자 기록·본인 글 수정 제한·감사 추적이 모두 가능해진다.
//
// 발행 게이트:
//   기본은 초안(보고서 published_at=null / 인사이트 needs_review).
//   토큰에 publish 스코프가 있어야만 서비스에 즉시 노출되는 상태로 저장된다.
//   → 에이전트가 실수로 사용자 화면에 글을 올리는 사고를 구조적으로 차단.

import { createMcpHandler, withMcpAuth } from 'mcp-handler'
import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js'
import { authenticateToken } from '@/lib/mcp/auth'
import { registerReadTools } from '@/lib/mcp/tools/read'
import { registerAnalyticsReadTools } from '@/lib/mcp/tools/read-analytics'
import { registerOpsTools } from '@/lib/mcp/tools/ops'
import { registerReportTools } from '@/lib/mcp/tools/reports'
import { registerArchiveTools } from '@/lib/mcp/tools/archive'

export const runtime = 'nodejs'
export const maxDuration = 60

// 툴은 요청과 무관하게 1회 등록된다. 권한(스코프) 검사는 각 툴 콜백 안에서
// extra.authInfo 를 읽어 수행한다 — 등록 시점에는 호출자가 누구인지 알 수 없다.
const mcpHandler = createMcpHandler(
  (server) => {
    registerReadTools(server)
    registerAnalyticsReadTools(server)
    registerOpsTools(server)
    registerReportTools(server)
    registerArchiveTools(server)
  },
  {
    serverInfo: { name: 'insight-out', version: '190' },
  },
  { basePath: '/api', maxDuration: 60, verboseLogs: false }
)

/**
 * Bearer 토큰 → mcp_tokens 조회 → 호출자 확정.
 * 반환값이 각 툴 콜백의 extra.authInfo 로 전달된다.
 * undefined 를 반환하면 withMcpAuth 가 401 로 응답한다(안전 기본값).
 */
async function verifyToken(_req: Request, bearerToken?: string): Promise<AuthInfo | undefined> {
  if (!bearerToken) return undefined

  const actor = await authenticateToken(bearerToken)
  if (!actor) return undefined

  return {
    token:    bearerToken,
    clientId: actor.userId,
    scopes:   actor.scopes,
    extra:    { ...actor }, // ← 툴이 actorFrom(extra) 로 꺼내 쓴다
  }
}

const authedHandler = withMcpAuth(mcpHandler, verifyToken, { required: true })

export { authedHandler as GET, authedHandler as POST }
