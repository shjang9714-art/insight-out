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
        'query 로 제목·요약 검색, group 으로 키워드그룹(예: AI, 클라우드) 필터링이 가능합니다.',
      inputSchema: {
        query: z.string().optional().describe('제목·요약에서 검색할 문자열'),
        group: z.string().optional().describe('키워드그룹명 필터 (matched_groups)'),
        category: z.string().optional().describe('news | report | youtube | opinion 등'),
        days: z.number().int().min(1).max(365).optional().describe('최근 N일 이내 (기본 30)'),
        limit: z.number().int().min(1).max(50).optional().describe('기본 10, 최대 50'),
      },
    },
    async ({ query, group, category, days, limit }, extra) => {
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
          .order('published_at', { ascending: false })
          .limit(limit ?? 10)

        if (query) q = q.or(`title.ilike.%${query}%,summary_ko.ilike.%${query}%`)
        if (group) q = q.contains('matched_groups', [group])
        if (category) q = q.eq('category', category)

        const { data, error } = await q
        if (error) return dbError(error, 'contents')

        const rows = (data ?? []) as ContentRow[]
        if (rows.length === 0) {
          return ok('검색 결과가 없습니다. 기간(days)을 늘리거나 검색어를 넓혀보세요.')
        }
        return ok(`${rows.length}건 검색됨:\n\n${rows.map(contentLine).join('\n\n')}`)
      } catch (err) {
        return dbError(err, 'contents')
      }
    }
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
    async ({ id, max_chars }, extra) => {
      const g = guard(extra)
      if (g.err) return g.err
      try {
        const admin = createAdminClient()
        const { data, error } = await admin
          .from('contents')
          .select('id, title, summary_ko, body_original, body_translated_ko, transcript_ko, category, author, original_url, published_at, matched_groups, sentiment, lgu_impact, matched_keywords')
          .eq('id', id)
          .eq('status', 'published')
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
    }
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
    async ({ query, status, limit }, extra) => {
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
    }
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
    async ({ query, competitor_only, limit }, extra) => {
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
    }
  )
}
