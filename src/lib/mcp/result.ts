// 190 — MCP 툴 결과 헬퍼
//
// 중요: 실패는 반드시 isError: true 로 돌려준다.
// 평범한 텍스트로 "조회 실패..."를 반환하면 호출하는 LLM 이 그걸 정상 데이터로
// 착각하고 진행한다(188 의 실제 버그). 프로토콜 플래그로 명확히 구분한다.

export interface McpToolResult {
  content: { type: 'text'; text: string }[]
  isError?: boolean
  [key: string]: unknown
}

export function ok(text: string): McpToolResult {
  return { content: [{ type: 'text', text }] }
}

export function fail(text: string): McpToolResult {
  return { content: [{ type: 'text', text }], isError: true }
}

export const TABLE_MISSING_CODE  = '42P01'
export const COLUMN_MISSING_CODE = '42703'
export const NO_ROWS_CODE        = 'PGRST116' // .single() 결과 0건

export function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

/** Supabase 에러를 사용자에게 이해되는 한국어 메시지로 변환 */
export function dbError(err: unknown, table: string): McpToolResult {
  const code = (err as { code?: string })?.code
  if (code === TABLE_MISSING_CODE) {
    return fail(`${table} 테이블이 아직 적용되지 않았습니다. docs/sql-handoff 의 SQL 을 Supabase 에 적용한 뒤 다시 시도해주세요.`)
  }
  if (code === NO_ROWS_CODE) {
    return fail('해당 id 의 항목을 찾을 수 없습니다.')
  }
  return fail(`DB 오류: ${errMessage(err)}`)
}

export function forbidden(scope: string): McpToolResult {
  return fail(
    `이 토큰에는 '${scope}' 권한이 없습니다. 어드민(/admin/mcp)에서 스코프를 추가하거나 새 토큰을 발급받으세요.`
  )
}
