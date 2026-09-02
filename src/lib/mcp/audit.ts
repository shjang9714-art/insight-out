import { actorFrom, auditLog } from '@/lib/mcp/auth'
import { errMessage, type McpToolResult } from '@/lib/mcp/result'

type ToolHandler<TArgs, TExtra> = (
  args: TArgs,
  extra: TExtra,
) => McpToolResult | Promise<McpToolResult>

function auditArgs(args: unknown, durationMs: number): Record<string, unknown> {
  const query = args !== null && typeof args === 'object'
    ? (args as { query?: unknown }).query
    : undefined
  return typeof query === 'string'
    ? { ms: durationMs, query: query.slice(0, 40) }
    : { ms: durationMs }
}

/** 읽기 툴 공통 감사: 검색어 앞 40자와 소요시간만 남기고 나머지 인자는 기록하지 않는다. */
export function withAudit<TArgs, TExtra>(
  toolName: string,
  handler: ToolHandler<TArgs, TExtra>,
): ToolHandler<TArgs, TExtra> {
  return async (args, extra) => {
    const startedAt = Date.now()
    const actor = actorFrom(extra)
    try {
      const result = await handler(args, extra)
      if (actor) {
        await auditLog({
          actor,
          tool: toolName,
          args: auditArgs(args, Date.now() - startedAt),
          ok: result.isError !== true,
          error: result.isError ? result.content.map(item => item.text).join('\n') : undefined,
        })
      }
      return result
    } catch (error) {
      if (actor) {
        await auditLog({
          actor,
          tool: toolName,
          args: auditArgs(args, Date.now() - startedAt),
          ok: false,
          error: errMessage(error),
        })
      }
      throw error
    }
  }
}
