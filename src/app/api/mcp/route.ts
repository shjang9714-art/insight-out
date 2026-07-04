import { createMcpHandler, withMcpAuth } from 'mcp-handler'
import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  REQUEST_STATUSES,
  ANNOUNCEMENT_STATUSES,
  REQUEST_KINDS,
  type OpsRequestRow,
} from '@/lib/admin/ops-requests'

export const runtime = 'nodejs'
export const maxDuration = 60

const POST_TYPES = ['request', 'announcement'] as const
const ALL_STATUSES = [...REQUEST_STATUSES, ...ANNOUNCEMENT_STATUSES]
const TABLE_MISSING_CODE = '42P01'

function textResult(text: string) {
  return { content: [{ type: 'text' as const, text }] }
}

function tableMissingResult() {
  return textResult('ops_requests 테이블이 아직 적용되지 않았습니다(42P01). 187 SQL 핸드오프 적용 후 다시 시도해주세요.')
}

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

const mcpHandler = createMcpHandler(
  (server) => {
    server.registerTool(
      'ops_request_list',
      {
        title: '운영 요청/공지 목록 조회',
        description:
          '운영 게시판(ops_requests)에서 요청 또는 공지 목록을 조회합니다. ' +
          'post_type 기본값은 request이며, status 미지정 시 요청은 미완료(대기+진행)만 반환합니다.',
        inputSchema: {
          post_type: z.enum(POST_TYPES).optional(),
          status: z.string().optional(),
          owner: z.string().optional(),
          limit: z.number().int().min(1).max(100).optional(),
        },
      },
      async ({ post_type, status, owner, limit }) => {
        const postType = post_type ?? 'request'
        try {
          const admin = createAdminClient()
          let query = admin
            .from('ops_requests')
            .select('*')
            .eq('post_type', postType)
            .order('pinned', { ascending: false })
            .order('updated_at', { ascending: false })
            .limit(limit ?? 20)

          if (status) {
            query = query.eq('status', status)
          } else if (postType === 'request') {
            query = query.in('status', ['pending', 'in_progress'])
          }
          if (owner) query = query.eq('owner', owner)

          const { data, error } = await query
          if (error) {
            if (error.code === TABLE_MISSING_CODE) return tableMissingResult()
            throw error
          }

          const rows = (data ?? []) as OpsRequestRow[]
          if (rows.length === 0) return textResult('조건에 맞는 게시글이 없습니다.')

          const lines = rows.map((r) =>
            `- [${r.status}] ${r.title} (종류:${r.kind}, 담당:${r.owner ?? '-'}, ref:${r.ref ?? '-'}, 업데이트:${r.updated_at}) id=${r.id}`
          )
          return textResult(lines.join('\n'))
        } catch (err) {
          return textResult(`조회 실패: ${errMessage(err)}`)
        }
      }
    )

    server.registerTool(
      'ops_request_create',
      {
        title: '운영 요청/공지 생성',
        description: '운영 게시판에 새 요청(SQL·인프라·설정 등) 또는 공지를 등록합니다.',
        inputSchema: {
          title: z.string().min(1),
          body: z.string().optional(),
          kind: z.enum(REQUEST_KINDS).optional(),
          owner: z.string().optional(),
          ref: z.string().optional(),
          post_type: z.enum(POST_TYPES).optional(),
          created_by: z.string().optional(),
        },
      },
      async ({ title, body, kind, owner, ref, post_type, created_by }) => {
        const postType = post_type ?? 'request'
        const payload = {
          post_type:  postType,
          title,
          body:       body ?? null,
          kind:       kind ?? 'other',
          status:     postType === 'announcement' ? 'active' : 'pending',
          owner:      owner ?? null,
          ref:        ref ?? null,
          pinned:     false,
          created_by: created_by ?? null,
        }
        try {
          const admin = createAdminClient()
          const { data, error } = await admin
            .from('ops_requests')
            .insert(payload)
            .select('id')
            .single()

          if (error) {
            if (error.code === TABLE_MISSING_CODE) return tableMissingResult()
            throw error
          }
          return textResult(`생성 완료. id=${(data as { id: string }).id}`)
        } catch (err) {
          return textResult(`생성 실패: ${errMessage(err)}`)
        }
      }
    )

    server.registerTool(
      'ops_request_update',
      {
        title: '운영 요청/공지 갱신',
        description:
          '상태·담당·참조·고정 여부를 갱신합니다. status=done 전환 시 resolved_at은 DB 트리거가 자동 기록합니다. ' +
          '삭제 툴은 제공하지 않습니다 — 종료 처리는 status 변경(done/archived)으로 합니다.',
        inputSchema: {
          id: z.string().uuid(),
          status: z.string().optional(),
          owner: z.string().optional(),
          ref: z.string().optional(),
          pinned: z.boolean().optional(),
          note: z.string().optional(),
        },
      },
      async ({ id, status, owner, ref, pinned, note }) => {
        if (status && !ALL_STATUSES.includes(status as typeof ALL_STATUSES[number])) {
          return textResult(`유효하지 않은 status 값입니다: ${status} (허용: ${ALL_STATUSES.join(', ')})`)
        }

        try {
          const admin = createAdminClient()
          const updatePayload: Record<string, unknown> = {}
          if (status !== undefined) updatePayload.status = status
          if (owner  !== undefined) updatePayload.owner  = owner
          if (ref    !== undefined) updatePayload.ref    = ref
          if (pinned !== undefined) updatePayload.pinned = pinned

          if (note) {
            const { data: existing, error: fetchErr } = await admin
              .from('ops_requests')
              .select('body')
              .eq('id', id)
              .single()
            if (fetchErr) {
              if (fetchErr.code === TABLE_MISSING_CODE) return tableMissingResult()
              throw fetchErr
            }
            const prevBody = (existing as { body: string | null } | null)?.body ?? ''
            const stamp = new Date().toISOString()
            updatePayload.body = prevBody ? `${prevBody}\n\n[${stamp}] ${note}` : `[${stamp}] ${note}`
          }

          if (Object.keys(updatePayload).length === 0) {
            return textResult('변경할 필드가 없습니다(status/owner/ref/pinned/note 중 하나 이상 필요).')
          }

          const { data, error } = await admin
            .from('ops_requests')
            .update(updatePayload)
            .eq('id', id)
            .select('*')
            .single()

          if (error) {
            if (error.code === TABLE_MISSING_CODE) return tableMissingResult()
            throw error
          }
          return textResult(`갱신 완료. id=${id}, status=${(data as OpsRequestRow).status}`)
        } catch (err) {
          return textResult(`갱신 실패: ${errMessage(err)}`)
        }
      }
    )
  },
  {},
  { basePath: '/api', maxDuration: 60, verboseLogs: false }
)

async function verifyToken(_req: Request, bearerToken?: string) {
  const expected = process.env.MCP_TOKEN
  if (!expected || !bearerToken || bearerToken !== expected) return undefined
  return { token: bearerToken, clientId: 'insight-out-admin', scopes: ['ops_requests'] }
}

const authedHandler = withMcpAuth(mcpHandler, verifyToken, { required: true })

export { authedHandler as GET, authedHandler as POST }
