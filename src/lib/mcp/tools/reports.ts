// 190 — MCP 전략보고서 툴 (ai_reports + ai_report_sources)
//
// 핵심 제약:
//   - ai_reports.user_id 는 NOT NULL FK(users). 즉 작성자 없이는 저장 자체가 불가능하다.
//     188 의 공용 단일 토큰으로는 이 테이블에 쓸 수 없었던 근본 이유.
//     190 에서는 토큰 → user_id 가 확정되므로 해결.
//   - 발행 게이트는 status 가 아니라 published_at 이다(null = 미발행 = 서비스 미노출).
//     publish 스코프가 없는 토큰은 published_at 을 절대 채울 수 없다.

import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { createAdminClient } from '@/lib/supabase/admin'
import { ok, fail, dbError, forbidden } from '@/lib/mcp/result'
import { auditLog, actorFrom, hasScope, type McpActor } from '@/lib/mcp/auth'
import { withAudit } from '@/lib/mcp/audit'
import { isAdminRole } from '@/lib/admin/capabilities'

const REPORT_TYPES = ['시장동향', '경쟁사분석', '키워드분석', '서비스리포트', '자유주제'] as const

interface ReportRow {
  id: string
  title: string
  type: string
  status: string
  topic: string | null
  summary: string | null
  published_at: string | null
  updated_at: string
}

/** 근거 콘텐츠·이슈를 ai_report_sources 에 연결. 다형 참조라 한 행에 하나만 채운다. */
async function linkSources(
  admin: ReturnType<typeof createAdminClient>,
  reportId: string,
  contentIds: string[] = [],
  issueIds: string[] = []
): Promise<{ linked: number; error?: string }> {
  const rows = [
    ...contentIds.map((cid) => ({ ai_report_id: reportId, content_id: cid, youtube_video_id: null, issue_id: null })),
    ...issueIds.map((iid) => ({ ai_report_id: reportId, content_id: null, youtube_video_id: null, issue_id: iid })),
  ]
  if (rows.length === 0) return { linked: 0 }

  const { error } = await admin.from('ai_report_sources').upsert(rows, { ignoreDuplicates: true })
  if (error) return { linked: 0, error: error.message }
  return { linked: rows.length }
}

function guard(extra: unknown): { actor: McpActor; err?: undefined } | { actor?: undefined; err: ReturnType<typeof fail> } {
  const actor = actorFrom(extra)
  if (!actor) return { err: fail('인증 정보를 확인할 수 없습니다.') }
  if (!hasScope(actor, 'reports')) return { err: forbidden('reports') }
  return { actor }
}

export function registerReportTools(server: McpServer) {

  // ── 보고서 작성 ───────────────────────────────────────────
  server.registerTool(
    'report_create',
    {
      title: '전략보고서 작성',
      description:
        '전략보고서를 작성합니다. 작성자는 토큰 소유자로 자동 기록됩니다.\n' +
        '작성 전에 content_search 로 근거 자료를 찾고, 그 id 들을 source_content_ids 에 넣으세요 — ' +
        '근거가 연결되지 않은 보고서는 서비스에서 출처를 보여줄 수 없습니다.\n' +
        '기본값은 미발행(초안)입니다. publish=true 로 즉시 발행하려면 토큰에 publish 권한이 있어야 합니다.',
      inputSchema: {
        title: z.string().min(1),
        type: z.enum(REPORT_TYPES).describe('보고서 분류 배지'),
        body_md: z.string().min(1).describe('보고서 본문 (마크다운)'),
        summary: z.string().optional().describe('카드에 노출될 2~3줄 요약'),
        topic: z.string().optional().describe('자유 주제명'),
        prompt: z.string().optional().describe('작성 요청/지시 원문 (추적용)'),
        source_content_ids: z.array(z.string().uuid()).optional().describe('근거 콘텐츠 id (content_search 결과)'),
        source_issue_ids: z.array(z.string().uuid()).optional().describe('근거 이슈 id (issue_list 결과)'),
        publish: z.boolean().optional().describe('true = 즉시 발행 (publish 권한 필요). 기본 false'),
      },
    },
    async ({ title, type, body_md, summary, topic, prompt, source_content_ids, source_issue_ids, publish }, extra) => {
      const g = guard(extra)
      if (g.err) return g.err
      const actor = g.actor
      if (publish && !hasScope(actor, 'publish')) return forbidden('publish')

      try {
        const admin = createAdminClient()
        const { data, error } = await admin
          .from('ai_reports')
          .insert({
            user_id:      actor.userId,
            type,
            status:       'completed', // MCP 는 생성이 아니라 완성된 본문을 저장
            title,
            prompt:       prompt ?? null,
            body_md,
            summary:      summary ?? null,
            topic:        topic ?? null,
            published_at: publish ? new Date().toISOString() : null, // ← 서비스 노출 게이트
          })
          .select('id')
          .single()

        if (error) {
          await auditLog({ actor, tool: 'report_create', targetTable: 'ai_reports', ok: false, error: error.message })
          return dbError(error, 'ai_reports')
        }

        const id = (data as { id: string }).id
        const link = await linkSources(admin, id, source_content_ids, source_issue_ids)

        await auditLog({
          actor,
          tool: 'report_create',
          targetTable: 'ai_reports',
          targetId: id,
          args: { title, type, publish: !!publish, sources: link.linked },
          ok: true,
        })

        return ok(
          [
            `보고서 저장 완료. id=${id}`,
            `작성자: ${actor.name || actor.email}`,
            `상태: ${publish ? '✅ 발행됨 (서비스 노출 중)' : '📝 미발행 초안 — 어드민에서 검토 후 발행'}`,
            `근거 연결: ${link.linked}건${link.error ? ` (일부 실패: ${link.error})` : ''}`,
          ].join('\n')
        )
      } catch (err) {
        return dbError(err, 'ai_reports')
      }
    }
  )

  // ── 보고서 수정 ───────────────────────────────────────────
  server.registerTool(
    'report_update',
    {
      title: '전략보고서 수정',
      description:
        '기존 보고서의 본문·요약·발행 상태를 수정합니다. 자기가 작성한 보고서만 수정할 수 있습니다(어드민 제외).',
      inputSchema: {
        id: z.string().uuid(),
        title: z.string().optional(),
        body_md: z.string().optional(),
        summary: z.string().optional(),
        topic: z.string().optional(),
        add_source_content_ids: z.array(z.string().uuid()).optional().describe('근거 콘텐츠 추가'),
        publish: z.boolean().optional().describe('true=발행, false=발행 취소 (publish 권한 필요)'),
      },
    },
    async ({ id, title, body_md, summary, topic, add_source_content_ids, publish }, extra) => {
      const g = guard(extra)
      if (g.err) return g.err
      const actor = g.actor
      if (publish !== undefined && !hasScope(actor, 'publish')) return forbidden('publish')

      try {
        const admin = createAdminClient()
        const { data: existing, error: fetchErr } = await admin
          .from('ai_reports')
          .select('id, user_id, title')
          .eq('id', id)
          .single()
        if (fetchErr) return dbError(fetchErr, 'ai_reports')

        const row = existing as { user_id: string; title: string }
        if (row.user_id !== actor.userId && !isAdminRole(actor.role)) {
          return fail('본인이 작성한 보고서만 수정할 수 있습니다.')
        }

        const patch: Record<string, unknown> = {}
        if (title   !== undefined) patch.title = title
        if (body_md !== undefined) patch.body_md = body_md
        if (summary !== undefined) patch.summary = summary
        if (topic   !== undefined) patch.topic = topic
        if (publish !== undefined) patch.published_at = publish ? new Date().toISOString() : null

        if (Object.keys(patch).length === 0 && !add_source_content_ids?.length) {
          return fail('변경할 필드가 없습니다.')
        }

        if (Object.keys(patch).length > 0) {
          const { error } = await admin.from('ai_reports').update(patch).eq('id', id)
          if (error) {
            await auditLog({ actor, tool: 'report_update', targetTable: 'ai_reports', targetId: id, ok: false, error: error.message })
            return dbError(error, 'ai_reports')
          }
        }

        const link = await linkSources(admin, id, add_source_content_ids)
        await auditLog({ actor, tool: 'report_update', targetTable: 'ai_reports', targetId: id, args: patch, ok: true })

        const state =
          publish === true ? '✅ 발행됨' : publish === false ? '📝 발행 취소됨' : '(발행 상태 변경 없음)'
        return ok(`보고서 수정 완료. id=${id}\n상태: ${state}\n근거 추가: ${link.linked}건`)
      } catch (err) {
        return dbError(err, 'ai_reports')
      }
    }
  )

  // ── 내 보고서 목록 ────────────────────────────────────────
  server.registerTool(
    'report_list',
    {
      title: '전략보고서 목록',
      description: '보고서 목록을 조회합니다. 기본은 내가 쓴 것만, mine=false 로 팀 전체 조회.',
      inputSchema: {
        mine: z.boolean().optional().describe('기본 true'),
        published_only: z.boolean().optional(),
        limit: z.number().int().min(1).max(50).optional(),
      },
    },
    withAudit('report_list', async ({ mine, published_only, limit }, extra) => {
      const g = guard(extra)
      if (g.err) return g.err
      const actor = g.actor
      try {
        const admin = createAdminClient()
        let q = admin
          .from('ai_reports')
          .select('id, title, type, status, topic, summary, published_at, updated_at')
          .order('updated_at', { ascending: false })
          .limit(limit ?? 20)

        if (mine !== false) q = q.eq('user_id', actor.userId)
        if (published_only) q = q.not('published_at', 'is', null)

        const { data, error } = await q
        if (error) return dbError(error, 'ai_reports')

        const rows = (data ?? []) as ReportRow[]
        if (rows.length === 0) return ok('보고서가 없습니다.')

        return ok(
          rows
            .map(
              (r) =>
                `• ${r.published_at ? '✅' : '📝'} ${r.title} (${r.type})\n  id=${r.id} | ${r.published_at ? `발행 ${r.published_at.slice(0, 10)}` : '미발행 초안'} | 수정 ${r.updated_at.slice(0, 10)}`
            )
            .join('\n\n')
        )
      } catch (err) {
        return dbError(err, 'ai_reports')
      }
    })
  )
}
