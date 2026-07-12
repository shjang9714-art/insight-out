// 190 — MCP 팀원별 토큰 인증
// ⚠️ 서버 전용. service_role 클라이언트를 쓰므로 클라이언트 컴포넌트에서 import 금지.
//
// 설계:
//   - 평문 토큰은 DB 에 없다. sha256 해시로만 조회한다(유출 내성).
//   - 조회 결과에 users 를 조인해 user_id/role 을 얻는다 → 툴이 "누가 썼는지" 알 수 있다.
//   - scopes 로 툴 접근을 나눈다. publish 스코프가 없으면 어떤 툴도 발행 상태로 만들 수 없다.

import { createHash, randomBytes } from 'node:crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { MCP_SCOPES, type McpScope } from '@/lib/mcp/scopes'

// 스코프 정의는 클라이언트 공용 모듈에 있다(어드민 화면이 import 하므로).
export { MCP_SCOPES, MCP_SCOPE_LABEL, MCP_SCOPE_DESC, type McpScope } from '@/lib/mcp/scopes'

export const TOKEN_PREFIX = 'io_'

/** 인증된 MCP 호출자 — 툴 콜백이 authInfo.extra 로 받는 값 */
export interface McpActor {
  tokenId: string
  userId: string
  email: string
  name: string
  role: 'user' | 'admin'
  scopes: McpScope[]
}

/** 새 평문 토큰 생성 (발급 시 1회만 노출) */
export function generateToken(): string {
  return TOKEN_PREFIX + randomBytes(24).toString('base64url')
}

/** 평문 토큰 → sha256 hex. 조회 키. */
export function hashToken(plain: string): string {
  return createHash('sha256').update(plain, 'utf8').digest('hex')
}

/** 목록 화면에서 토큰을 식별하기 위한 접두 표시(예: io_a1b2c3d4) */
export function tokenPrefix(plain: string): string {
  return plain.slice(0, TOKEN_PREFIX.length + 8)
}

interface TokenRow {
  id: string
  user_id: string
  scopes: string[] | null
  expires_at: string | null
  revoked_at: string | null
  users: { email: string; name: string; role: 'user' | 'admin' } | null
}

/**
 * Bearer 토큰을 검증하고 호출자 정보를 돌려준다.
 * 실패 시 null — 호출부(withMcpAuth)가 401 처리.
 *
 * 해시 컬럼이 unique 이므로 동등 비교로 조회한다. 평문 비교가 아니라
 * 해시 조회이므로 타이밍 공격 표면이 사실상 없다(입력에서 해시를 역산할 수 없음).
 */
export async function authenticateToken(plain: string): Promise<McpActor | null> {
  if (!plain || !plain.startsWith(TOKEN_PREFIX)) return null

  const admin = createAdminClient()
  // ⚠️ mcp_tokens 는 users 를 두 번 참조한다(user_id, created_by).
  // 힌트 없이 users!inner(...) 로 조인하면 PostgREST 가 모호하다며 거부한다
  // ("more than one relationship was found"). FK 이름을 명시할 것.
  const { data, error } = await admin
    .from('mcp_tokens')
    .select('id, user_id, scopes, expires_at, revoked_at, users!mcp_tokens_user_id_fkey!inner(email, name, role)')
    .eq('token_hash', hashToken(plain))
    .is('revoked_at', null)
    .maybeSingle<TokenRow>()

  if (error || !data) return null
  if (data.expires_at && new Date(data.expires_at) < new Date()) return null

  const user = data.users
  if (!user) return null

  // 마지막 사용 시각 갱신 — 실패해도 인증은 통과시킨다(부가 정보일 뿐).
  void admin
    .from('mcp_tokens')
    .update({ last_used_at: new Date().toISOString() })
    .eq('id', data.id)
    .then(() => undefined)

  const scopes = (data.scopes ?? []).filter((s): s is McpScope =>
    (MCP_SCOPES as readonly string[]).includes(s)
  )

  return {
    tokenId: data.id,
    userId:  data.user_id,
    email:   user.email,
    name:    user.name,
    role:    user.role,
    scopes,
  }
}

export function hasScope(actor: McpActor, scope: McpScope): boolean {
  return actor.scopes.includes(scope)
}

/**
 * 툴 콜백의 extra 에서 호출자를 꺼낸다.
 *
 * mcp-handler 는 서버(툴 등록)를 요청과 무관하게 1회 구성하고, 인증 결과는
 * 요청마다 extra.authInfo 로 주입한다. 따라서 스코프 검사는 등록 시점이 아니라
 * 반드시 콜백 안에서 해야 한다.
 */
export function actorFrom(extra: unknown): McpActor | null {
  const authInfo = (extra as { authInfo?: { extra?: unknown } } | undefined)?.authInfo
  const actor = authInfo?.extra as McpActor | undefined
  return actor?.userId ? actor : null
}

/**
 * MCP 쓰기 감사 로그. 실패해도 툴 동작을 막지 않는다(로그는 부가 기능).
 * 읽기 툴은 호출하지 않는다 — 볼륨만 늘고 추적 가치가 낮음.
 */
export async function auditLog(params: {
  actor: McpActor
  tool: string
  targetTable?: string
  targetId?: string
  args?: Record<string, unknown>
  ok: boolean
  error?: string
}): Promise<void> {
  try {
    const admin = createAdminClient()
    await admin.from('mcp_audit_log').insert({
      user_id:      params.actor.userId,
      token_id:     params.actor.tokenId,
      tool:         params.tool,
      target_table: params.targetTable ?? null,
      target_id:    params.targetId ?? null,
      args:         params.args ?? null,
      ok:           params.ok,
      error:        params.error ?? null,
    })
  } catch {
    // 감사 로그 실패는 조용히 무시 — 툴 결과에 영향 주지 않음
  }
}
