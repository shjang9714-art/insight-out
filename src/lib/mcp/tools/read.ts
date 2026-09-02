// 190 — MCP 읽기·검색 툴
//
// 존재 이유: 이게 없으면 Claude 는 인사이트 아웃이 수집한 자료를 못 보고
// 자기 사전지식만으로 보고서를 쓴다. 즉 "근거 없는 글"이 된다.
// 보고서/인사이트 툴은 여기서 얻은 content_id 를 인용 근거로 쓴다.

import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { createAdminClient } from '@/lib/supabase/admin'
import { ok, fail, dbError, forbidden } from '@/lib/mcp/result'
import { actorFrom, hasScope } from '@/lib/mcp/auth'
import { withAudit } from '@/lib/mcp/audit'
import { getEntityBrief } from '@/lib/entities/brief'

interface ContentRow {
  id: string
  title: string
  summary_ko: string | null
  category: string
  author: string | null
  original_url: string | null
  published_at: string | null
  matched_groups: string[] | null
  importance_score: number | null
  sentiment: string | null
  lgu_impact: string | null
  matched_keywords: string[] | null
}

function contentLine(c: ContentRow): string {
  const date = c.published_at ? c.published_at.slice(0, 10) : '-'
  const tags = (c.matched_groups ?? []).join('/') || '-'
  return [
    `• ${c.title}`,
    `  id=${c.id} | ${date} | ${c.category} | 태그:${tags}`,
    c.summary_ko ? `  요약: ${c.summary_ko}` : null,
    c.original_url ? `  링크: ${c.original_url}` : null,
  ]
    .filter(Boolean)
    .join('\n')
}

/** 모든 읽기 툴 공통: 인증 + read 스코프 확인 */
function guard(extra: unknown) {
  const actor = actorFrom(extra)
  if (!actor) return { err: fail('인증 정보를 확인할 수 없습니다.') }
  if (!hasScope(actor, 'read')) return { err: forbidden('read') }
  return { actor }
}

export function registerReadTools(server: McpServer) {
  // ── 콘텐츠 검색 ────────────────────────────────────────────
  server.registerTool(
    'content_search',
    {
      title: '콘텐츠 검색',
      description:
        '인사이트 아웃이 수집한 콘텐츠(뉴스·리포트·유튜브)를 검색합니다. ' +
        '보고서나 인사이트를 쓰기 전에 반드시 이 툴로 근거 자료를 찾고, 반환된 id 를 인용에 사용하세요. ' +
        'query 로 제목·요약 검색, group 으로 키워드그룹(예: AI, 클라우드) 필터링이 가능합니다. ' +
        '기간이 길수록 느립니다. 30~90일을 권장합니다.',
      inputSchema: {
        query: z.string().optional().describe('제목·요약에서 검색할 문자열'),
        group: z.string().optional().describe('키워드그룹명 필터 (matched_groups)'),
        category: z.string().optional().describe('news | report | youtube | opinion 등'),
        days: z.number().int().min(1).max(180).optional().describe('최근 N일 이내 (기본 30, 30~90 권장)'),
        limit: z.number().int().min(1).max(50).optional().describe('기본 10, 최대 50'),
      },
    },
    withAudit('content_search', async ({ query, group, category, days, limit }, extra) => {
      const g = guard(extra)
      if (g.err) return g.err
      try {
        const admin = createAdminClient()
        const since = new Date(Date.now() - (days ?? 30) * 86_400_000).toISOString()

        let q = admin
          .from('contents')
          .select('id, title, summary_ko, category, author, original_url, published_at, matched_groups, importance_score')
          .eq('status', 'published')
          .gte('published_at', since)
          .is('deleted_at', null)
          .order('published_at', { ascending: false })
          .limit(limit ?? 10)

        if (query) {
          q = query.length >= 3
            ? q.or(`title.ilike.%${query}%,summary_ko.ilike.%${query}%`)
            : q.ilike('title', `%${query}%`)
        }
        if (group) q = q.contains('matched_groups', [group])
        if (category) q = q.eq('category', category)

        const { data, error } = await q
        if (error) return dbError(error, 'contents')

        const rows = (data ?? []) as ContentRow[]
        const shortQueryNotice = query && query.length <= 2
          ? '※ 2자 이하 검색어는 제목만 검색합니다.\n\n'
          : ''
        if (rows.length === 0) {
          return ok(`${shortQueryNotice}검색 결과가 없습니다. 기간(days)을 늘리거나 검색어를 넓혀보세요.`)
        }
        return ok(`${shortQueryNotice}${rows.length}건 검색됨:\n\n${rows.map(contentLine).join('\n\n')}`)
      } catch (err) {
        return dbError(err, 'contents')
      }
    })
  )

  // ── 콘텐츠 본문 조회 ──────────────────────────────────────
  server.registerTool(
    'content_get',
    {
      title: '콘텐츠 본문 조회',
      description:
        '콘텐츠 1건의 전체 본문(요약·원문·번역·유튜브 자막)을 가져옵니다. ' +
        'content_search 로 후보를 좁힌 뒤, 실제로 인용할 자료만 이 툴로 정독하세요.',
      inputSchema: {
        id: z.string().uuid(),
        max_chars: z.number().int().min(500).max(20000).optional().describe('본문 최대 길이 (기본 6000)'),
      },
    },
    withAudit('content_get', async ({ id, max_chars }, extra) => {
      const g = guard(extra)
      if (g.err) return g.err
      try {
        const admin = createAdminClient()
        const { data, error } = await admin
          .from('contents')
          .select('id, title, summary_ko, body_original, body_translated_ko, transcript_ko, category, author, original_url, published_at, matched_groups, sentiment, lgu_impact, matched_keywords')
          .eq('id', id)
          .eq('status', 'published')
          .is('deleted_at', null)
          .single()

        if (error) return dbError(error, 'contents')

        const c = data as ContentRow & {
          body_original: string | null
          body_translated_ko: string | null
          transcript_ko: string | null
        }
        const cap = max_chars ?? 6000
        const body =
          c.body_translated_ko || c.transcript_ko || c.body_original || '(본문 없음)'

        return ok(
          [
            `제목: ${c.title}`,
            `id: ${c.id}`,
            `발행: ${c.published_at?.slice(0, 10) ?? '-'} | 매체: ${c.author ?? '-'} | 분류: ${c.category}`,
            `태그: ${(c.matched_groups ?? []).join('/') || '-'}`,
            `논조: ${c.sentiment ?? '-'} | LGU+ 임팩트: ${c.lgu_impact ?? '-'}`,
            `키워드: ${(c.matched_keywords ?? []).join(', ') || '-'}`,
            `링크: ${c.original_url ?? '-'}`,
            '',
            `요약: ${c.summary_ko ?? '-'}`,
            '',
            '본문:',
            body.slice(0, cap) + (body.length > cap ? `\n\n…(${body.length - cap}자 생략)` : ''),
          ].join('\n')
        )
      } catch (err) {
        return dbError(err, 'contents')
      }
    })
  )

  // ── 이슈 목록 ─────────────────────────────────────────────
  server.registerTool(
    'issue_list',
    {
      title: '이슈 목록 조회',
      description:
        '큐레이션된 이슈(주제 클러스터) 목록을 조회합니다. 보고서를 특정 이슈에 연결하거나 ' +
        '핵심인사이트의 issue_id 로 지정할 때 사용합니다.',
      inputSchema: {
        query: z.string().optional().describe('이슈명 검색'),
        status: z.enum(['draft', 'published', 'archived']).optional(),
        limit: z.number().int().min(1).max(50).optional(),
      },
    },
    withAudit('issue_list', async ({ query, status, limit }, extra) => {
      const g = guard(extra)
      if (g.err) return g.err
      try {
        const admin = createAdminClient()
        let q = admin
          .from('issues')
          .select('id, title, summary, status, match_keywords, updated_at')
          .order('updated_at', { ascending: false })
          .limit(limit ?? 20)

        if (query) q = q.ilike('title', `%${query}%`)
        if (status) q = q.eq('status', status)

        const { data, error } = await q
        if (error) return dbError(error, 'issues')

        const rows = (data ?? []) as {
          id: string
          title: string
          summary: string | null
          status: string
          match_keywords: string[] | null
        }[]
        if (rows.length === 0) return ok('조건에 맞는 이슈가 없습니다.')

        return ok(
          rows
            .map(
              (r) =>
                `• [${r.status}] ${r.title}\n  id=${r.id} | 키워드:${(r.match_keywords ?? []).join(', ') || '-'}` +
                (r.summary ? `\n  ${r.summary}` : '')
            )
            .join('\n\n')
        )
      } catch (err) {
        return dbError(err, 'issues')
      }
    })
  )

  // ── 기업·기관 조회 ────────────────────────────────────────
  server.registerTool(
    'entity_list',
    {
      title: '기업·기관 조회',
      description:
        '추적 중인 기업/기관(경쟁사 포함)을 조회합니다. 경쟁사 분석 보고서를 쓸 때 ' +
        'is_competitor=true 로 대상 기업을 먼저 확인하세요.',
      inputSchema: {
        query: z.string().optional().describe('기업명 검색'),
        competitor_only: z.boolean().optional().describe('경쟁사만'),
        limit: z.number().int().min(1).max(50).optional(),
      },
    },
    withAudit('entity_list', async ({ query, competitor_only, limit }, extra) => {
      const g = guard(extra)
      if (g.err) return g.err
      try {
        const admin = createAdminClient()
        let q = admin
          .from('entities')
          .select('id, canonical_name, entity_type, description, is_competitor, mention_count')
          .order('mention_count', { ascending: false })
          .limit(limit ?? 20)

        if (query) q = q.ilike('canonical_name', `%${query}%`)
        if (competitor_only) q = q.eq('is_competitor', true)

        const { data, error } = await q
        if (error) return dbError(error, 'entities')

        const rows = (data ?? []) as {
          id: string
          canonical_name: string
          entity_type: string
          is_competitor: boolean
          mention_count: number
        }[]
        if (rows.length === 0) return ok('조건에 맞는 기업/기관이 없습니다.')

        return ok(
          rows
            .map(
              (r) =>
                `• ${r.canonical_name}${r.is_competitor ? ' [경쟁사]' : ''} (${r.entity_type}, 언급 ${r.mention_count}회) id=${r.id}`
            )
            .join('\n')
        )
      } catch (err) {
        return dbError(err, 'entities')
      }
    })
  )

  // ── 기업·기관 종합 조회 ──────────────────────────────────
  server.registerTool(
    'entity_brief',
    {
      title: '기업·기관 종합',
      description:
        '특정 기업/기관의 최근 상황을 한 번에 조회합니다. entity_list → content_search → content_get 을 ' +
        '순서대로 부르는 대신 이 툴을 먼저 부르세요. 이름(name)만으로 조회됩니다.',
      inputSchema: {
        name: z.string().optional().describe('기업·기관 이름'),
        entity_id: z.string().optional().describe('기업·기관 id'),
        events: z.number().int().min(1).max(30).optional().describe('최근 사건 개수 (기본 10)'),
        neighbors: z.number().int().min(1).max(30).optional().describe('관계 기업·기관 개수 (기본 8)'),
        contents: z.number().int().min(1).max(30).optional().describe('최근 뉴스 개수 (기본 10)'),
      },
    },
    withAudit('entity_brief', async ({ name, entity_id, events, neighbors, contents }, extra) => {
      const g = guard(extra)
      if (g.err) return g.err
      if (!name && !entity_id) return fail('name 또는 entity_id 중 하나를 입력해주세요.')

      try {
        const brief = await getEntityBrief(
          createAdminClient(),
          entity_id ? { id: entity_id } : { name: name! },
          { events, neighbors, contents },
        )
        const label = name ?? entity_id
        if (!brief) return ok(`${label}을(를) 찾을 수 없습니다.`)

        const summary = brief.signalSummary
          ? `시그널 ${brief.signalSummary.signalCount}건 | 콘텐츠 ${brief.signalSummary.contentCount}건 | 유형: ${brief.signalSummary.signalTypes.join(', ') || '-'} | 최근: ${brief.signalSummary.lastSeen ?? '-'}`
          : '조회 결과 없음'
        const lines = [
          `기업·기관: ${brief.entity.canonicalName} (${brief.entity.entityType})`,
          `id=${brief.entity.id}${brief.entity.isCompetitor ? ' | 경쟁사' : ''}`,
          brief.entity.description ? `설명: ${brief.entity.description}` : null,
          `별칭: ${brief.aliases.join(', ') || '-'}`,
          '',
          '## 시그널 요약',
          summary,
          '',
          '## 최근 사건',
          brief.events.length > 0
            ? brief.events.map((event) => `• ${event.eventDate} | ${event.headline}\n  id=${event.id} | 유형:${event.signalType ?? '-'} | 사업영향:${event.bizImpact ?? '-'}${event.detail ? `\n  ${event.detail}` : ''}`).join('\n')
            : '• 없음',
          '',
          '## 관계',
          brief.neighbors.length > 0
            ? brief.neighbors.map((neighbor) => `• ${neighbor.canonicalName} (${neighbor.entityType}) | 평균의 ${neighbor.lift.toFixed(1)}배 | 공동언급 ${neighbor.weight}건\n  id=${neighbor.entityId}`).join('\n')
            : '• 없음',
          '',
          '## 최근 뉴스',
          brief.contents.length > 0
            ? brief.contents.map((content) => `• ${content.title}\n  id=${content.id} | 수집:${content.collectedAt.slice(0, 10)}`).join('\n')
            : '• 없음',
          brief.errors.length > 0 ? `\n⚠️ 일부 섹션 조회 실패: ${brief.errors.join(' / ')}` : null,
        ]

        return ok(lines.filter((line): line is string => line !== null).join('\n'))
      } catch (err) {
        return dbError(err, 'entity_brief')
      }
    })
  )
}
