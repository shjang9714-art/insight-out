// COUNCIL 임베드용 읽기 전용 REST 브릿지 (/api/council)
//
// 존재 이유:
//   COUNCIL(AI 협의체)이 토론·페르소나 구성에 인사이트 아웃의 MI 데이터를 쓰려면
//   콘텐츠·이슈·기업동향을 조회할 수 있어야 한다. /api/mcp 는 MCP JSON-RPC 라
//   외부 앱이 소비하기엔 무겁고 응답이 사람용 텍스트다. 여기서는 동일한 Supabase
//   쿼리를 재사용하되 구조화된 JSON 을 돌려준다.
//
// 인증:
//   기존 MCP 토큰(io_...) 을 그대로 재사용. read 스코프 필수.
//   COUNCIL 서버가 공용 read 토큰 1개를 Bearer 로 보낸다(토큰은 COUNCIL 서버에만 보관).
//
// ⚠️ 읽기 전용. 어떤 쓰기도 하지 않는다.

import { NextResponse, type NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { authenticateToken, hasScope } from '@/lib/mcp/auth'

export const runtime = 'nodejs'
export const maxDuration = 30

function bearer(req: NextRequest): string | null {
  const h = req.headers.get('authorization') ?? ''
  const m = h.match(/^Bearer\s+(.+)$/i)
  return m ? m[1] : null
}

function jsonError(status: number, message: string) {
  return NextResponse.json({ error: message }, { status })
}

export async function GET(req: NextRequest) {
  // ── 인증 ──────────────────────────────────────────────
  const token = bearer(req)
  if (!token) return jsonError(401, 'Bearer 토큰이 필요합니다.')
  const actor = await authenticateToken(token)
  if (!actor) return jsonError(401, '유효하지 않은 토큰입니다.')
  if (!hasScope(actor, 'read')) return jsonError(403, "이 토큰에는 'read' 권한이 없습니다.")

  const { searchParams } = req.nextUrl
  const resource = searchParams.get('resource') ?? 'search'
  const admin = createAdminClient()

  try {
    // ── 콘텐츠 검색 ────────────────────────────────────
    if (resource === 'search') {
      const query = searchParams.get('q') ?? undefined
      const group = searchParams.get('group') ?? undefined
      const category = searchParams.get('category') ?? undefined
      const days = Number(searchParams.get('days') ?? 30)
      const limit = Math.min(Number(searchParams.get('limit') ?? 10), 50)
      const since = new Date(Date.now() - days * 86_400_000).toISOString()

      let q = admin
        .from('contents')
        .select(
          'id, title, summary_ko, category, author, original_url, published_at, matched_groups, importance_score',
        )
        .eq('status', 'published')
        .gte('published_at', since)
        .order('published_at', { ascending: false })
        .limit(limit)

      if (query) q = q.or(`title.ilike.%${query}%,summary_ko.ilike.%${query}%`)
      if (group) q = q.contains('matched_groups', [group])
      if (category) q = q.eq('category', category)

      const { data, error } = await q
      if (error) return jsonError(500, `DB 오류: ${error.message}`)

      const items = (data ?? []).map((c: Record<string, unknown>) => ({
        id: c.id,
        title: c.title,
        summary: c.summary_ko ?? null,
        category: c.category,
        author: c.author ?? null,
        url: c.original_url ?? null,
        publishedAt: c.published_at ?? null,
        tags: (c.matched_groups as string[] | null) ?? [],
        importance: c.importance_score ?? null,
      }))
      return NextResponse.json({ resource, count: items.length, items })
    }

    // ── 콘텐츠 본문 조회 ───────────────────────────────
    if (resource === 'content') {
      const id = searchParams.get('id')
      if (!id) return jsonError(400, 'id 가 필요합니다.')
      const cap = Math.min(Number(searchParams.get('max_chars') ?? 6000), 20000)

      const { data, error } = await admin
        .from('contents')
        .select(
          'id, title, summary_ko, body_original, body_translated_ko, transcript_ko, category, author, original_url, published_at, matched_groups',
        )
        .eq('id', id)
        .single()

      if (error) return jsonError(404, '해당 id 의 콘텐츠를 찾을 수 없습니다.')

      const c = data as Record<string, unknown>
      const body =
        (c.body_translated_ko as string | null) ||
        (c.transcript_ko as string | null) ||
        (c.body_original as string | null) ||
        ''
      return NextResponse.json({
        resource,
        item: {
          id: c.id,
          title: c.title,
          summary: c.summary_ko ?? null,
          category: c.category,
          author: c.author ?? null,
          url: c.original_url ?? null,
          publishedAt: c.published_at ?? null,
          tags: (c.matched_groups as string[] | null) ?? [],
          body: body.slice(0, cap),
          truncated: body.length > cap,
        },
      })
    }

    // ── 이슈 목록 ──────────────────────────────────────
    if (resource === 'issues') {
      const query = searchParams.get('q') ?? undefined
      const status = searchParams.get('status') ?? undefined
      const limit = Math.min(Number(searchParams.get('limit') ?? 20), 50)

      let q = admin
        .from('issues')
        .select('id, title, summary, status, match_keywords, updated_at')
        .order('updated_at', { ascending: false })
        .limit(limit)

      if (query) q = q.ilike('title', `%${query}%`)
      if (status) q = q.eq('status', status)

      const { data, error } = await q
      if (error) return jsonError(500, `DB 오류: ${error.message}`)

      const items = (data ?? []).map((r: Record<string, unknown>) => ({
        id: r.id,
        title: r.title,
        summary: r.summary ?? null,
        status: r.status,
        keywords: (r.match_keywords as string[] | null) ?? [],
      }))
      return NextResponse.json({ resource, count: items.length, items })
    }

    // ── 기업·기관 조회 ─────────────────────────────────
    if (resource === 'entities') {
      const query = searchParams.get('q') ?? undefined
      const competitorOnly = searchParams.get('competitor_only') === 'true'
      const limit = Math.min(Number(searchParams.get('limit') ?? 20), 50)

      let q = admin
        .from('entities')
        .select('id, canonical_name, entity_type, description, is_competitor, mention_count')
        .order('mention_count', { ascending: false })
        .limit(limit)

      if (query) q = q.ilike('canonical_name', `%${query}%`)
      if (competitorOnly) q = q.eq('is_competitor', true)

      const { data, error } = await q
      if (error) return jsonError(500, `DB 오류: ${error.message}`)

      const items = (data ?? []).map((r: Record<string, unknown>) => ({
        id: r.id,
        name: r.canonical_name,
        type: r.entity_type,
        description: r.description ?? null,
        isCompetitor: r.is_competitor ?? false,
        mentionCount: r.mention_count ?? 0,
      }))
      return NextResponse.json({ resource, count: items.length, items })
    }

    // ── 핵심 인사이트 ──────────────────────────────────
    if (resource === 'insights') {
      const query = searchParams.get('q') ?? undefined
      const limit = Math.min(Number(searchParams.get('limit') ?? 6), 20)

      let q = admin
        .from('daily_insights')
        .select('id, headline, summary_ko, created_at')
        .eq('status', 'published')
        .order('created_at', { ascending: false })
        .limit(limit)

      if (query) q = q.ilike('headline', `%${query}%`)

      const { data, error } = await q
      if (error) return jsonError(500, `DB 오류: ${error.message}`)

      const items = (data ?? []).map((r: Record<string, unknown>) => ({
        headline: r.headline,
        summary: r.summary_ko ?? null,
      }))
      return NextResponse.json({ resource, count: items.length, items })
    }

    // ── AI 리포트 ──────────────────────────────────────
    if (resource === 'reports') {
      const limit = Math.min(Number(searchParams.get('limit') ?? 6), 20)

      const { data, error } = await admin
        .from('ai_reports')
        .select('title, summary, published_at')
        .not('published_at', 'is', null)
        .order('published_at', { ascending: false })
        .limit(limit)

      if (error) return jsonError(500, `DB 오류: ${error.message}`)

      const items = (data ?? []).map((r: Record<string, unknown>) => ({
        title: r.title,
        summary: r.summary ?? null,
      }))
      return NextResponse.json({ resource, count: items.length, items })
    }

    // ── 경쟁사 주간 브리핑 ─────────────────────────────
    if (resource === 'competitor') {
      const limit = Math.min(Number(searchParams.get('limit') ?? 6), 10)

      const { data, error } = await admin
        .from('competitor_weekly_reports')
        .select('summary, week_start, week_end')
        .eq('status', 'published')
        .order('week_start', { ascending: false })
        .limit(limit)

      if (error) return jsonError(500, `DB 오류: ${error.message}`)

      const items = (data ?? []).map((r: Record<string, unknown>) => ({
        title: (r.summary as string | null) ?? `${r.week_start}~${r.week_end}`,
        summary: r.summary ?? null,
      }))
      return NextResponse.json({ resource, count: items.length, items })
    }

    // ── 트렌딩 키워드 ──────────────────────────────────
    if (resource === 'keywords') {
      const limit = Math.min(Number(searchParams.get('limit') ?? 10), 20)

      const { data, error } = await admin
        .from('trending_keywords')
        .select('title, recent_count, prev_count')
        .order('recent_count', { ascending: false })
        .limit(limit)

      if (error) {
        // 뷰 미존재(42P01) 등은 graceful 빈배열
        if (error.code === '42P01') return NextResponse.json({ resource, count: 0, items: [] })
        return jsonError(500, `DB 오류: ${error.message}`)
      }

      const items = (data ?? []).map((r: Record<string, unknown>) => {
        const recent = Number(r.recent_count ?? 0)
        const prev = Number(r.prev_count ?? 0)
        const item: { name: unknown; trend?: string } = { name: r.title }
        if (prev > 0) {
          const pct = Math.round(((recent - prev) / prev) * 100)
          item.trend = `${pct >= 0 ? '+' : ''}${pct}%`
        }
        return item
      })
      return NextResponse.json({ resource, count: items.length, items })
    }

    return jsonError(400, `알 수 없는 resource: ${resource}`)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return jsonError(500, `조회 실패: ${message}`)
  }
}
