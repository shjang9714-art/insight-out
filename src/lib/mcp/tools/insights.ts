// 190 — MCP 핵심인사이트 툴 (key_insights)
//
// key_insights 는 사용자 화면(홈·인사이트)에 바로 뜨는 큐레이션 카드다.
// status: draft | needs_review | published | rejected
//   - publish 스코프 없는 토큰 → needs_review 로만 저장 (사람이 검토 후 게시)
//   - publish 스코프 있는 토큰 → published 로 즉시 게시 가능
// is_featured(홈 3건 노출)는 영향 범위가 커서 publish 권한 필수.

import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { createAdminClient } from '@/lib/supabase/admin'
import { ok, fail, dbError, forbidden } from '@/lib/mcp/result'
import { auditLog, actorFrom, hasScope, type McpActor } from '@/lib/mcp/auth'

const INSIGHT_STATUSES = ['draft', 'needs_review', 'published', 'rejected'] as const

/** 해당 주(주차 시작 = 목요일) 계산 — key_insights.week_of 규칙 */
function currentWeekOf(): string {
  const now = new Date()
  const day = now.getUTCDay() // 0=일 … 4=목
  const diff = (day - 4 + 7) % 7
  const thursday = new Date(now)
  thursday.setUTCDate(now.getUTCDate() - diff)
  return thursday.toISOString().slice(0, 10)
}

function guard(extra: unknown): { actor: McpActor; err?: undefined } | { actor?: undefined; err: ReturnType<typeof fail> } {
  const actor = actorFrom(extra)
  if (!actor) return { err: fail('인증 정보를 확인할 수 없습니다.') }
  if (!hasScope(actor, 'insights')) return { err: forbidden('insights') }
  return { actor }
}

export function registerInsightTools(server: McpServer) {

  server.registerTool(
    'key_insight_create',
    {
      title: '핵심인사이트 카드 작성',
      description:
        '주간 핵심인사이트 카드를 작성합니다. headline(제목) + summary_ko(핵심요약 2문장) + implication(LGU+ 관점 시사점)이 핵심 3요소입니다.\n' +
        '반드시 content_search 로 실제 수집된 자료를 확인하고 source_url 에 원문 링크를 넣으세요.\n' +
        '기본값은 needs_review(검토 대기)입니다. status=published 로 즉시 게시하려면 토큰에 publish 권한이 필요합니다.',
      inputSchema: {
        headline: z.string().min(1).describe('카드 제목'),
        summary_ko: z.string().min(1).describe('핵심요약 2문장'),
        implication: z.string().optional().describe('LGU+ 관점 시사점 1~2문장'),
        category: z.string().optional().describe('뉴스 | 유튜브 | 리서치 | 웹인사이트'),
        source_name: z.string().optional().describe('매체명'),
        source_url: z.string().url().optional().describe('대표 원문 링크'),
        published_at: z.string().optional().describe('원문 발행일 (YYYY-MM-DD)'),
        issue_id: z.string().uuid().optional().describe('연결할 이슈 (issue_list 결과)'),
        week_of: z.string().optional().describe('배치 주차 시작일(목). 기본 이번 주'),
        display_order: z.number().int().optional(),
        status: z.enum(INSIGHT_STATUSES).optional().describe('publish 권한 없으면 needs_review 로 강제'),
        is_featured: z.boolean().optional().describe('홈 3건 노출 (publish 권한 필요)'),
      },
    },
    async (args, extra) => {
      const g = guard(extra)
      if (g.err) return g.err
      const actor = g.actor
      const canPublish = hasScope(actor, 'publish')

      if (args.status === 'published' && !canPublish) return forbidden('publish')
      if (args.is_featured && !canPublish) return forbidden('publish')

      // publish 권한이 없으면 무슨 값을 넣든 needs_review 로 고정한다.
      const status = canPublish ? (args.status ?? 'needs_review') : 'needs_review'

      try {
        const admin = createAdminClient()
        const { data, error } = await admin
          .from('key_insights')
          .insert({
            week_of:       args.week_of ?? currentWeekOf(),
            status,
            display_order: args.display_order ?? null,
            is_featured:   canPublish ? (args.is_featured ?? false) : false,
            category:      args.category ?? null,
            headline:      args.headline,
            summary_ko:    args.summary_ko,
            implication:   args.implication ?? null,
            source_name:   args.source_name ?? null,
            source_url:    args.source_url ?? null,
            published_at:  args.published_at ?? null,
            issue_id:      args.issue_id ?? null,
            needs_verify:  !args.source_url, // 링크 없으면 검증 필요 표기
          })
          .select('id')
          .single()

        if (error) {
          await auditLog({ actor, tool: 'key_insight_create', targetTable: 'key_insights', ok: false, error: error.message })
          return dbError(error, 'key_insights')
        }

        const id = (data as { id: string }).id
        await auditLog({
          actor,
          tool: 'key_insight_create',
          targetTable: 'key_insights',
          targetId: id,
          args: { headline: args.headline, status },
          ok: true,
        })

        const stateMsg =
          status === 'published'
            ? '✅ 게시됨 (서비스 노출 중)'
            : '🔍 검토 대기 (needs_review) — 어드민 /admin/key-insights 에서 게시'

        return ok(
          [
            `핵심인사이트 저장 완료. id=${id}`,
            `주차: ${args.week_of ?? currentWeekOf()}`,
            `상태: ${stateMsg}`,
            !args.source_url ? '⚠️ 원문 링크가 없어 needs_verify 로 표시됩니다.' : null,
          ]
            .filter(Boolean)
            .join('\n')
        )
      } catch (err) {
        return dbError(err, 'key_insights')
      }
    }
  )

  server.registerTool(
    'key_insight_update',
    {
      title: '핵심인사이트 수정',
      description: '기존 핵심인사이트 카드의 내용·상태를 수정합니다.',
      inputSchema: {
        id: z.string().uuid(),
        headline: z.string().optional(),
        summary_ko: z.string().optional(),
        implication: z.string().optional(),
        source_url: z.string().url().optional(),
        status: z.enum(INSIGHT_STATUSES).optional(),
        is_featured: z.boolean().optional(),
        display_order: z.number().int().optional(),
      },
    },
    async ({ id, headline, summary_ko, implication, source_url, status, is_featured, display_order }, extra) => {
      const g = guard(extra)
      if (g.err) return g.err
      const actor = g.actor
      const canPublish = hasScope(actor, 'publish')

      if (status === 'published' && !canPublish) return forbidden('publish')
      if (is_featured && !canPublish) return forbidden('publish')

      const patch: Record<string, unknown> = {}
      if (headline      !== undefined) patch.headline = headline
      if (summary_ko    !== undefined) patch.summary_ko = summary_ko
      if (implication   !== undefined) patch.implication = implication
      if (source_url    !== undefined) { patch.source_url = source_url; patch.needs_verify = false }
      if (status        !== undefined) patch.status = status
      if (is_featured   !== undefined) patch.is_featured = is_featured
      if (display_order !== undefined) patch.display_order = display_order

      if (Object.keys(patch).length === 0) return fail('변경할 필드가 없습니다.')

      try {
        const admin = createAdminClient()
        const { data, error } = await admin
          .from('key_insights')
          .update(patch)
          .eq('id', id)
          .select('status')
          .single()

        if (error) {
          await auditLog({ actor, tool: 'key_insight_update', targetTable: 'key_insights', targetId: id, ok: false, error: error.message })
          return dbError(error, 'key_insights')
        }

        await auditLog({ actor, tool: 'key_insight_update', targetTable: 'key_insights', targetId: id, args: patch, ok: true })
        return ok(`수정 완료. id=${id}, status=${(data as { status: string }).status}`)
      } catch (err) {
        return dbError(err, 'key_insights')
      }
    }
  )

  server.registerTool(
    'key_insight_list',
    {
      title: '핵심인사이트 목록',
      description: '핵심인사이트 카드를 조회합니다. 중복 작성을 피하려면 쓰기 전에 이 툴로 기존 카드를 먼저 확인하세요.',
      inputSchema: {
        week_of: z.string().optional().describe('기본 이번 주'),
        status: z.enum(INSIGHT_STATUSES).optional(),
        limit: z.number().int().min(1).max(50).optional(),
      },
    },
    async ({ week_of, status, limit }, extra) => {
      const g = guard(extra)
      if (g.err) return g.err
      try {
        const admin = createAdminClient()
        let q = admin
          .from('key_insights')
          .select('id, headline, summary_ko, status, category, is_featured, source_url, week_of')
          .eq('week_of', week_of ?? currentWeekOf())
          .order('display_order', { ascending: true, nullsFirst: false })
          .limit(limit ?? 20)

        if (status) q = q.eq('status', status)

        const { data, error } = await q
        if (error) return dbError(error, 'key_insights')

        const rows = (data ?? []) as {
          id: string
          headline: string
          summary_ko: string
          status: string
          category: string | null
          is_featured: boolean
        }[]
        if (rows.length === 0) return ok(`${week_of ?? currentWeekOf()} 주차에 등록된 핵심인사이트가 없습니다.`)

        return ok(
          rows
            .map(
              (r) =>
                `• [${r.status}]${r.is_featured ? ' ⭐' : ''} ${r.headline}\n  id=${r.id} | ${r.category ?? '-'}\n  ${r.summary_ko}`
            )
            .join('\n\n')
        )
      } catch (err) {
        return dbError(err, 'key_insights')
      }
    }
  )
}
