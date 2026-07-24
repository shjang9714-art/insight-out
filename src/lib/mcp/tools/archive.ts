import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { createAdminClient } from '@/lib/supabase/admin'
import { actorFrom, hasScope } from '@/lib/mcp/auth'
import { dbError, fail, forbidden, ok } from '@/lib/mcp/result'

const DEFAULT_ARCHIVE_NAME = '봇 아카이브'

function guard(extra: unknown) {
  const actor = actorFrom(extra)
  if (!actor) return { err: fail('인증 정보를 확인할 수 없습니다.') }
  if (!hasScope(actor, 'archive')) return { err: forbidden('archive') }
  return { actor }
}

function stringify(value: unknown): string {
  try { return JSON.stringify(value) } catch { return String(value) }
}

export function registerArchiveTools(server: McpServer) {
  server.registerTool('content_archive', {
    title: '콘텐츠 아카이브 추가',
    description: '발행된 기사를 이 토큰 계정의 개인 아카이브에 담습니다. archive_name을 생략하면 기본 봇 아카이브를 사용합니다.',
    inputSchema: {
      content_id: z.string().uuid(),
      note: z.string().optional(),
      archive_name: z.string().optional(),
    },
  }, async ({ content_id, note, archive_name }, extra) => {
    const g = guard(extra); if (g.err) return g.err
    const userId = g.actor.userId
    try {
      const admin = createAdminClient()
      const { data: content, error: contentError } = await admin
        .from('contents').select('id, title').eq('id', content_id).eq('status', 'published').maybeSingle()
      if (contentError) return dbError(contentError, 'contents')
      if (!content) return fail('발행된 콘텐츠가 아니거나 존재하지 않습니다.')

      const name = archive_name?.trim() || DEFAULT_ARCHIVE_NAME
      const initialArchive = await admin
        .from('archives').select('id, name').eq('user_id', userId).eq('name', name).maybeSingle()
      if (initialArchive.error) return dbError(initialArchive.error, 'archives')
      let archive = initialArchive.data
      if (!archive) {
        const created = await admin.from('archives').insert({ user_id: userId, name }).select('id, name').single()
        if (created.error) return dbError(created.error, 'archives')
        archive = created.data
      }

      const existing = await admin.from('archive_items').select('archive_id').eq('archive_id', archive.id).eq('content_id', content_id).maybeSingle()
      if (existing.error) return dbError(existing.error, 'archive_items')
      if (existing.data) return ok(`이미 아카이브됨: ${archive.name} — ${content.title}`)

      const inserted = await admin.from('archive_items').insert({ archive_id: archive.id, content_id, note: note ?? null })
      if (inserted.error) return dbError(inserted.error, 'archive_items')
      return ok(`아카이브에 담았습니다: ${archive.name} — ${content.title}`)
    } catch (error) { return dbError(error, 'archives') }
  })

  server.registerTool('archive_list', {
    title: '내 아카이브 조회',
    description: '이 토큰 계정의 아카이브만 조회합니다. 반환된 content_id는 content_get으로 본문을 연결할 수 있습니다.',
    inputSchema: {
      archive_name: z.string().optional(),
      limit: z.number().int().min(1).max(100).optional(),
    },
  }, async ({ archive_name, limit }, extra) => {
    const g = guard(extra); if (g.err) return g.err
    try {
      const admin = createAdminClient()
      let archiveQuery = admin.from('archives').select('id, name, description').eq('user_id', g.actor.userId).order('updated_at', { ascending: false })
      if (archive_name?.trim()) archiveQuery = archiveQuery.eq('name', archive_name.trim())
      const { data: archives, error: archiveError } = await archiveQuery
      if (archiveError) return dbError(archiveError, 'archives')
      const output: unknown[] = []
      for (const archive of archives ?? []) {
        const { data: items, error: itemsError } = await admin.from('archive_items')
          .select('content_id, note, added_at, order, contents(title, original_url, published_at)')
          .eq('archive_id', archive.id).order('order', { ascending: true }).order('added_at', { ascending: false }).limit(limit ?? 100)
        if (itemsError) return dbError(itemsError, 'archive_items')
        output.push({ id: archive.id, name: archive.name, description: archive.description, items: items ?? [] })
      }
      return ok(output.length ? output.map(stringify).join('\n\n') : '아카이브가 없습니다.')
    } catch (error) { return dbError(error, 'archives') }
  })
}
