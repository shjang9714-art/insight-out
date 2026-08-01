import { verifyAdminRequest } from '@/lib/admin/verify-admin-request'
// 190 — MCP 토큰 발급·조회·폐기 API (어드민 전용)
//
// 평문 토큰은 발급 응답에서 딱 1번만 돌려준다. DB 에는 sha256 해시만 남으므로
// 이후에는 어드민도 원문을 볼 수 없다 — 분실 시 재발급이 유일한 방법.

import { NextRequest, NextResponse } from 'next/server'
import { generateToken, hashToken, tokenPrefix, MCP_SCOPES, type McpScope } from '@/lib/mcp/auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const TABLE_MISSING_CODE = '42P01'
function tableMissing() {
  return NextResponse.json(
    { error: 'mcp_tokens 테이블이 없습니다. docs/sql-handoff/190-mcp-tokens.sql 을 Supabase 에 적용해주세요.' },
    { status: 503 }
  )
}

/** GET — 발급된 토큰 목록(평문 없음) + 토큰을 줄 수 있는 팀원 목록 */
export async function GET() {
  const gate = await verifyAdminRequest({ capability: 'manage_settings' })
  if (!gate.ok) return gate.response

  const admin = gate.admin

  // ⚠️ mcp_tokens 는 users 를 두 번 참조한다(user_id = 토큰 소유자, created_by = 발급한 어드민).
  // 힌트 없이 users!inner(...) 로 조인하면 PostgREST 가 모호하다며 거부한다.
  // 여기서 필요한 건 "토큰 소유자" 쪽이므로 user_id FK 를 명시한다.
  const [tokensRes, usersRes] = await Promise.all([
    admin
      .from('mcp_tokens')
      .select('id, label, token_prefix, scopes, last_used_at, expires_at, revoked_at, created_at, users!mcp_tokens_user_id_fkey!inner(id, name, email)')
      .order('created_at', { ascending: false }),
    admin.from('users').select('id, name, email').order('name', { ascending: true }),
  ])

  if (tokensRes.error) {
    if (tokensRes.error.code === TABLE_MISSING_CODE) return tableMissing()
    return NextResponse.json({ error: tokensRes.error.message }, { status: 500 })
  }

  return NextResponse.json({
    tokens: tokensRes.data ?? [],
    users:  usersRes.data ?? [],
  })
}

/** POST — 팀원에게 새 토큰 발급. 평문은 이 응답에서만 노출된다. */
export async function POST(req: NextRequest) {
  const gate = await verifyAdminRequest({ capability: 'manage_settings' })
  if (!gate.ok) return gate.response

  let body: { user_id?: string; label?: string; scopes?: string[]; expires_at?: string | null }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: '잘못된 요청 형식입니다.' }, { status: 400 })
  }

  const { user_id, label, scopes, expires_at } = body
  if (!user_id) {
    return NextResponse.json({ error: '토큰을 발급할 팀원(user_id)을 지정해주세요.' }, { status: 400 })
  }

  const validScopes = (scopes ?? ['read', 'ops']).filter((s): s is McpScope =>
    (MCP_SCOPES as readonly string[]).includes(s)
  )
  if (validScopes.length === 0) {
    return NextResponse.json({ error: '유효한 스코프를 하나 이상 선택해주세요.' }, { status: 400 })
  }

  const plain = generateToken()
  const admin = gate.admin

  const { data, error } = await admin
    .from('mcp_tokens')
    .insert({
      user_id,
      label:        label ?? '',
      token_hash:   hashToken(plain),
      token_prefix: tokenPrefix(plain),
      scopes:       validScopes,
      expires_at:   expires_at ?? null,
      created_by:   gate.userId,
    })
    .select('id')
    .single()

  if (error) {
    if (error.code === TABLE_MISSING_CODE) return tableMissing()
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({
    id: (data as { id: string }).id,
    token: plain, // ⚠️ 최초 1회만. 다시는 조회 불가.
    scopes: validScopes,
  })
}

/** PATCH — 토큰 폐기 (삭제가 아니라 revoked_at 기록 — 감사 이력 보존) */
export async function PATCH(req: NextRequest) {
  const gate = await verifyAdminRequest({ capability: 'manage_settings' })
  if (!gate.ok) return gate.response

  let body: { id?: string; action?: 'revoke' }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: '잘못된 요청 형식입니다.' }, { status: 400 })
  }

  if (!body.id) return NextResponse.json({ error: 'id 가 필요합니다.' }, { status: 400 })

  const admin = gate.admin
  const { error } = await admin
    .from('mcp_tokens')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', body.id)

  if (error) {
    if (error.code === TABLE_MISSING_CODE) return tableMissing()
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
