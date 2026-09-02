import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { createAdminClient } from '@/lib/supabase/admin'
import { actorFrom, hasScope } from '@/lib/mcp/auth'
import { withAudit } from '@/lib/mcp/audit'
import { dbError, fail, forbidden, ok } from '@/lib/mcp/result'

function guard(extra: unknown) {
  const actor = actorFrom(extra)
  if (!actor) return { err: fail('인증 정보를 확인할 수 없습니다.') }
  if (!hasScope(actor, 'bookmark')) return { err: forbidden('bookmark') }
  return { actor }
}

function stringify(value: unknown): string {
  try { return JSON.stringify(value) } catch { return String(value) }
}

export function registerBookmarkTools(server: McpServer) {
  server.registerTool('bookmark_add', {
    title: '콘텐츠 북마크 추가',
    description: '발행된 기사를 이 토큰 계정의 북마크에 담습니다.',
    inputSchema: {
      content_id: z.string().uuid(),
    },
  }, async ({ content_id }, extra) => {
    const g = guard(extra); if (g.err) return g.err
    const userId = g.actor.userId
    try {
      const admin = createAdminClient()
      const { data: content, error: contentError } = await admin
        .from('contents').select('id, title').eq('id', content_id).eq('status', 'published').maybeSingle()
      if (contentError) return dbError(contentError, 'contents')
      if (!content) return fail('발행된 콘텐츠가 아니거나 존재하지 않습니다.')

      const existing = await admin.from('bookmarks').select('id').eq('user_id', userId).eq('content_id', content_id).maybeSingle()
      if (existing.error) return dbError(existing.error, 'bookmarks')
      if (existing.data) return ok(`이미 북마크됨: ${content.title}`)

      const inserted = await admin.from('bookmarks').insert({ user_id: userId, content_id })
      if (inserted.error) return dbError(inserted.error, 'bookmarks')
      return ok(`북마크에 담았습니다: ${content.title}`)
    } catch (error) { return dbError(error, 'bookmarks') }
  })

  server.registerTool('bookmark_list', {
    title: '내 북마크 조회',
    description: '이 토큰 계정의 북마크만 조회합니다. 반환된 content_id는 content_get으로 본문을 연결할 수 있습니다.',
    inputSchema: {
      limit: z.number().int().min(1).max(100).optional(),
    },
  }, withAudit('bookmark_list', async ({ limit }, extra) => {
    const g = guard(extra); if (g.err) return g.err
    try {
      const admin = createAdminClient()
      const { data: items, error } = await admin.from('bookmarks')
        // 492 · 3단계 D — service_role 조회라 RLS(SQL B)로 안 덮인다. contents.deleted_at 을
        // 함께 받아 소프트 삭제된 콘텐츠 항목은 아래에서 명시적으로 걸러낸다.
        .select('content_id, ai_report_id, created_at, contents(title, original_url, published_at, deleted_at), ai_reports(title, type, published_at)')
        .eq('user_id', g.actor.userId)
        .order('created_at', { ascending: false })
        .limit(limit ?? 100)
      if (error) return dbError(error, 'bookmarks')
      // 리포트 항목은 contents 조인이 없어 빈 엔트리로 보이므로 타입 표기와 함께 별도 형태로 반환한다.
      const normalizedItems = (items ?? [])
        .filter((item) => {
          const row = item as unknown as { content_id: string | null; contents: { deleted_at: string | null } | null }
          if (!row.content_id) return true // ai_report 항목은 무관
          return Boolean(row.contents) && !row.contents!.deleted_at
        })
        .map((item) => {
          const row = item as unknown as {
            content_id: string | null
            ai_report_id: string | null
            created_at: string
            contents: { title: string; original_url: string | null; published_at: string | null; deleted_at: string | null } | null
            ai_reports: { title: string; type: string; published_at: string | null } | null
          }
          if (row.ai_report_id && row.ai_reports) {
            return {
              type: 'ai_report',
              ai_report_id: row.ai_report_id,
              created_at: row.created_at,
              title: row.ai_reports.title,
              report_type: row.ai_reports.type,
              published_at: row.ai_reports.published_at,
            }
          }
          return {
            type: 'content',
            content_id: row.content_id,
            created_at: row.created_at,
            contents: row.contents ? { title: row.contents.title, original_url: row.contents.original_url, published_at: row.contents.published_at } : null,
          }
        })
      return ok(normalizedItems.length ? normalizedItems.map(stringify).join('\n\n') : '북마크가 없습니다.')
    } catch (error) { return dbError(error, 'bookmarks') }
  }))
}
