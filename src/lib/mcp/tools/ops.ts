// 190 — MCP 작업기록·운영 게시판 툴 (ops_requests)
//
// 188 대비 변경점:
//   1. post_type 에 'work'(작업계획/결과) 추가 — 189 에서 만든 타입인데 MCP 에 없었다.
//   2. ops_get 신설 — 188 은 body 를 읽는 툴이 없어서, note 로 append 한 내용을
//      다시 읽을 방법이 없었다(쓰기 전용 게시판). 치명적 결함이었음.
//   3. phase/seq 노출 — 작업계획을 단계별로 묶어 기록.
//   4. created_by 를 클라이언트 입력이 아니라 인증된 토큰의 사용자명으로 강제.

import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { createAdminClient } from '@/lib/supabase/admin'
import { ok, fail, dbError, forbidden } from '@/lib/mcp/result'
import { auditLog, actorFrom, hasScope, type McpActor } from '@/lib/mcp/auth'
import {
  REQUEST_STATUSES,
  ANNOUNCEMENT_STATUSES,
  REQUEST_KINDS,
  type OpsRequestRow,
} from '@/lib/admin/ops-requests'

const POST_TYPES = ['request', 'announcement', 'work'] as const
type PostType = (typeof POST_TYPES)[number]

/** post_type 별로 허용되는 status — 188 은 이 교차검증이 없어 공지에 'pending' 을 넣을 수 있었다. */
const STATUS_BY_TYPE: Record<PostType, readonly string[]> = {
  request:      REQUEST_STATUSES,
  work:         REQUEST_STATUSES, // 작업도 pending/in_progress/done/blocked
  announcement: ANNOUNCEMENT_STATUSES,
}

function summarize(r: OpsRequestRow): string {
  const meta = [
    `종류:${r.kind}`,
    `담당:${r.owner ?? '-'}`,
    r.phase ? `단계:${r.phase}` : null,
    r.seq !== null ? `순번:${r.seq}` : null,
    `ref:${r.ref ?? '-'}`,
  ]
    .filter(Boolean)
    .join(', ')
  return `• [${r.status}] ${r.title}\n  id=${r.id} | ${meta} | 수정:${r.updated_at.slice(0, 16).replace('T', ' ')}`
}

/** 인증 + ops 스코프 확인. 스코프 검사는 등록 시점이 아니라 호출 시점에 해야 한다. */
function guard(extra: unknown): { actor: McpActor; err?: undefined } | { actor?: undefined; err: ReturnType<typeof fail> } {
  const actor = actorFrom(extra)
  if (!actor) return { err: fail('인증 정보를 확인할 수 없습니다.') }
  if (!hasScope(actor, 'ops')) return { err: forbidden('ops') }
  return { actor }
}

export function registerOpsTools(server: McpServer) {
  // ── 목록 ──────────────────────────────────────────────────
  server.registerTool(
    'ops_list',
    {
      title: '작업·요청·공지 목록',
      description:
        '운영 게시판을 조회합니다. post_type: work(작업계획/결과) | request(요청) | announcement(공지). ' +
        'status 미지정 시 작업·요청은 미완료(대기+진행)만 반환합니다. 본문은 포함되지 않으니 ops_get 으로 상세를 보세요.',
      inputSchema: {
        post_type: z.enum(POST_TYPES).optional().describe('기본 work'),
        status: z.string().optional().describe('pending | in_progress | done | blocked (공지: active | archived)'),
        owner: z.string().optional(),
        phase: z.string().optional().describe('작업 단계 필터'),
        limit: z.number().int().min(1).max(100).optional(),
      },
    },
    async ({ post_type, status, owner, phase, limit }, extra) => {
      const g = guard(extra)
      if (g.err) return g.err
      const postType: PostType = post_type ?? 'work'

      if (status && !STATUS_BY_TYPE[postType].includes(status)) {
        return fail(
          `'${postType}' 에는 status='${status}' 를 쓸 수 없습니다. 허용: ${STATUS_BY_TYPE[postType].join(', ')}`
        )
      }

      try {
        const admin = createAdminClient()
        let q = admin
          .from('ops_requests')
          .select('*')
          .eq('post_type', postType)
          .order('pinned', { ascending: false })
          .order('updated_at', { ascending: false })
          .limit(limit ?? 20)

        if (status) q = q.eq('status', status)
        else if (postType !== 'announcement') q = q.in('status', ['pending', 'in_progress'])
        if (owner) q = q.eq('owner', owner)
        if (phase) q = q.eq('phase', phase)

        const { data, error } = await q
        if (error) return dbError(error, 'ops_requests')

        const rows = (data ?? []) as OpsRequestRow[]
        if (rows.length === 0) return ok('조건에 맞는 항목이 없습니다.')
        return ok(`${rows.length}건:\n\n${rows.map(summarize).join('\n\n')}`)
      } catch (err) {
        return dbError(err, 'ops_requests')
      }
    }
  )

  // ── 상세 조회 (188 에 없던 툴) ────────────────────────────
  server.registerTool(
    'ops_get',
    {
      title: '작업·요청 상세 조회',
      description:
        '항목 1건의 전체 본문(누적된 진행 메모 포함)을 읽습니다. ' +
        'ops_update 의 note 로 append 한 기록을 다시 읽으려면 이 툴을 쓰세요.',
      inputSchema: { id: z.string().uuid() },
    },
    async ({ id }, extra) => {
      const g = guard(extra)
      if (g.err) return g.err
      try {
        const admin = createAdminClient()
        const { data, error } = await admin.from('ops_requests').select('*').eq('id', id).single()
        if (error) return dbError(error, 'ops_requests')

        const r = data as OpsRequestRow
        return ok(
          [
            `제목: ${r.title}`,
            `id: ${r.id}`,
            `유형: ${r.post_type} | 상태: ${r.status} | 종류: ${r.kind}`,
            `담당: ${r.owner ?? '-'} | 단계: ${r.phase ?? '-'} | 순번: ${r.seq ?? '-'}`,
            `작성자: ${r.created_by ?? '-'} | ref: ${r.ref ?? '-'}`,
            `생성: ${r.created_at} | 수정: ${r.updated_at}${r.resolved_at ? ` | 완료: ${r.resolved_at}` : ''}`,
            '',
            '본문:',
            r.body ?? '(없음)',
          ].join('\n')
        )
      } catch (err) {
        return dbError(err, 'ops_requests')
      }
    }
  )

  // ── 생성 ──────────────────────────────────────────────────
  server.registerTool(
    'ops_create',
    {
      title: '작업·요청·공지 등록',
      description:
        '작업계획(work), 요청(request), 공지(announcement)를 등록합니다. ' +
        '작업계획은 phase(단계)와 seq(순번)로 묶어 기록하세요. 작성자는 토큰 소유자로 자동 기록됩니다.',
      inputSchema: {
        title: z.string().min(1),
        body: z.string().optional().describe('마크다운 허용. 작업계획 상세나 결과를 여기에.'),
        post_type: z.enum(POST_TYPES).optional().describe('기본 work'),
        kind: z.enum(REQUEST_KINDS).optional(),
        owner: z.string().optional().describe('담당자명. 미지정 시 토큰 소유자'),
        ref: z.string().optional().describe('지시서 번호 / commit SHA / 링크'),
        phase: z.string().optional().describe('작업 단계명 (work 전용)'),
        seq: z.number().int().optional().describe('단계 내 순번 (work 전용)'),
      },
    },
    async ({ title, body, post_type, kind, owner, ref, phase, seq }, extra) => {
      const g = guard(extra)
      if (g.err) return g.err
      const actor = g.actor
      const postType: PostType = post_type ?? 'work'
      const payload = {
        post_type:  postType,
        title,
        body:       body ?? null,
        kind:       kind ?? 'other',
        status:     postType === 'announcement' ? 'active' : 'pending',
        owner:      owner ?? (actor.name || null),
        ref:        ref ?? null,
        pinned:     false,
        phase:      phase ?? null,
        seq:        seq ?? null,
        created_by: actor.name || actor.email, // 클라이언트가 사칭할 수 없음
      }

      try {
        const admin = createAdminClient()
        const { data, error } = await admin.from('ops_requests').insert(payload).select('id').single()
        if (error) {
          await auditLog({ actor, tool: 'ops_create', targetTable: 'ops_requests', ok: false, error: error.message })
          return dbError(error, 'ops_requests')
        }

        const id = (data as { id: string }).id
        await auditLog({ actor, tool: 'ops_create', targetTable: 'ops_requests', targetId: id, args: { title, post_type: postType }, ok: true })
        return ok(`등록 완료. id=${id} (${postType}, 작성자: ${actor.name || actor.email})`)
      } catch (err) {
        return dbError(err, 'ops_requests')
      }
    }
  )

  // ── 갱신 ──────────────────────────────────────────────────
  server.registerTool(
    'ops_update',
    {
      title: '작업·요청 갱신',
      description:
        '상태·담당·단계·순번을 갱신하고, note 로 진행 메모를 본문에 누적합니다. ' +
        'status=done 전환 시 완료시각은 DB 가 자동 기록합니다. 삭제는 지원하지 않습니다 — done/archived 로 종료하세요.',
      inputSchema: {
        id: z.string().uuid(),
        status: z.string().optional(),
        owner: z.string().optional(),
        ref: z.string().optional(),
        pinned: z.boolean().optional(),
        phase: z.string().optional(),
        seq: z.number().int().optional(),
        note: z.string().optional().describe('본문 끝에 [시각 · 작성자] 와 함께 append 됩니다.'),
      },
    },
    async ({ id, status, owner, ref, pinned, phase, seq, note }, extra) => {
      const g = guard(extra)
      if (g.err) return g.err
      const actor = g.actor
      try {
        const admin = createAdminClient()

        // 대상 행을 먼저 읽어 post_type 기준으로 status 를 교차검증한다.
        const { data: existing, error: fetchErr } = await admin
          .from('ops_requests')
          .select('post_type, body')
          .eq('id', id)
          .single()
        if (fetchErr) return dbError(fetchErr, 'ops_requests')

        const row = existing as { post_type: PostType; body: string | null }
        const allowed = STATUS_BY_TYPE[row.post_type] ?? REQUEST_STATUSES

        if (status && !allowed.includes(status)) {
          return fail(
            `'${row.post_type}' 항목에는 status='${status}' 를 쓸 수 없습니다. 허용: ${allowed.join(', ')}`
          )
        }

        const patch: Record<string, unknown> = {}
        if (status !== undefined) patch.status = status
        if (owner  !== undefined) patch.owner  = owner
        if (ref    !== undefined) patch.ref    = ref
        if (pinned !== undefined) patch.pinned = pinned
        if (phase  !== undefined) patch.phase  = phase
        if (seq    !== undefined) patch.seq    = seq

        if (note) {
          const prev = row.body ?? ''
          const stamp = new Date().toISOString().slice(0, 16).replace('T', ' ')
          const entry = `[${stamp} · ${actor.name || actor.email}] ${note}`
          patch.body = prev ? `${prev}\n\n${entry}` : entry
        }

        if (Object.keys(patch).length === 0) {
          return fail('변경할 필드가 없습니다 (status/owner/ref/pinned/phase/seq/note 중 하나 이상 필요).')
        }

        const { data, error } = await admin
          .from('ops_requests')
          .update(patch)
          .eq('id', id)
          .select('status')
          .single()

        if (error) {
          await auditLog({ actor, tool: 'ops_update', targetTable: 'ops_requests', targetId: id, ok: false, error: error.message })
          return dbError(error, 'ops_requests')
        }

        await auditLog({ actor, tool: 'ops_update', targetTable: 'ops_requests', targetId: id, args: patch, ok: true })
        return ok(`갱신 완료. id=${id}, status=${(data as { status: string }).status}`)
      } catch (err) {
        return dbError(err, 'ops_requests')
      }
    }
  )
}
