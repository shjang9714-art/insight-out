import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { createAdminClient } from '@/lib/supabase/admin'
import { sanitizeReportHtml } from '@/lib/reports/sanitize-html'
import type { AiReportType } from '@/lib/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * 348/349-A — 전략보고서 수동 등록(Claude MCP 경로).
 *
 * 앱이 LLM에게 HTML을 통째로 생성시키는 기존 경로(`/api/reports/generate-strategy`)와 달리,
 * **사람이 Claude로 작성·검토한 본문**을 그대로 등록한다. 유료 API 없이 고품질 보고서를 내는 현재의 정식 경로.
 * 근거는 `sourceTitles`(우리 DB 기사 제목)로 매칭해 `ai_report_sources`에 연결한다 — 보고서의 각주가
 * 외부 죽은 링크가 아니라 **우리 DB 콘텐츠 상세**를 가리키게 하기 위함.
 */

const REPORT_TYPES: AiReportType[] = ['시장동향', '경쟁사분석', '키워드분석', '서비스리포트', '자유주제']

async function verifyAdmin() {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(toSet) { toSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options)) },
      },
    }
  )
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) {
    return { error: NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 }), userId: null }
  }
  const { data: profile } = await supabase.from('users').select('role').eq('id', user.id).single()
  if (!profile || profile.role !== 'admin') {
    return { error: NextResponse.json({ error: '관리자 권한이 필요합니다.' }, { status: 403 }), userId: null }
  }
  return { error: null, userId: user.id }
}

interface ImportBody {
  type?: string
  topic?: string
  title?: string
  summary?: string
  bodyHtml?: string
  /** 우리 DB 기사 제목(부분 일치) — ai_report_sources 로 연결 */
  sourceTitles?: string[]
  /** true 면 등록과 동시에 발행 */
  publish?: boolean
}

/**
 * PATCH — 이미 등록된 보고서의 본문·요약을 교체한다(Claude 로 다시 쓴 본문 반영).
 * body: { reportId, title?, summary?, bodyHtml? }
 */
export async function PATCH(request: NextRequest) {
  const { error: authError } = await verifyAdmin()
  if (authError) return authError

  let body: ImportBody & { reportId?: string }
  try {
    body = await request.json() as ImportBody & { reportId?: string }
  } catch {
    return NextResponse.json({ error: '요청 형식이 올바르지 않습니다.' }, { status: 400 })
  }

  const reportId = (body.reportId ?? '').trim()
  if (!reportId) return NextResponse.json({ error: 'reportId 가 필요합니다.' }, { status: 400 })

  const patch: Record<string, unknown> = {}
  if (typeof body.title === 'string' && body.title.trim()) patch.title = body.title.trim()
  if (typeof body.summary === 'string') patch.summary = body.summary.trim() || null
  if (typeof body.bodyHtml === 'string' && body.bodyHtml.trim()) {
    patch.body_html = sanitizeReportHtml(body.bodyHtml.trim())
  }
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: '변경할 항목이 없습니다.' }, { status: 400 })
  }

  const admin = createAdminClient()
  const { error } = await admin.from('ai_reports').update(patch).eq('id', reportId)
  if (error) {
    console.error('[reports/import] PATCH 실패:', error.message)
    return NextResponse.json({ error: '보고서 수정에 실패했습니다.' }, { status: 500 })
  }
  return NextResponse.json({ ok: true, reportId, updated: Object.keys(patch) })
}

export async function POST(request: NextRequest) {
  const { error: authError, userId } = await verifyAdmin()
  if (authError) return authError

  let body: ImportBody
  try {
    body = await request.json() as ImportBody
  } catch {
    return NextResponse.json({ error: '요청 형식이 올바르지 않습니다.' }, { status: 400 })
  }

  const type = (body.type ?? '') as AiReportType
  if (!REPORT_TYPES.includes(type)) {
    return NextResponse.json({ error: '유효하지 않은 보고서 유형입니다.' }, { status: 400 })
  }
  const topic = (body.topic ?? '').trim()
  const title = (body.title ?? '').trim()
  const bodyHtml = (body.bodyHtml ?? '').trim()
  if (!topic || !title || !bodyHtml) {
    return NextResponse.json({ error: 'topic·title·bodyHtml 은 필수입니다.' }, { status: 400 })
  }

  const admin = createAdminClient()

  const { data: inserted, error: insertError } = await admin
    .from('ai_reports')
    .insert({
      user_id: userId,
      type,
      status: 'completed',
      title,
      topic,
      prompt: topic,
      summary: (body.summary ?? '').trim() || null,
      body_html: sanitizeReportHtml(bodyHtml),
      published_at: body.publish ? new Date().toISOString() : null,
    })
    .select('id')
    .single()

  if (insertError || !inserted) {
    console.error('[reports/import] 등록 실패:', insertError?.message)
    return NextResponse.json({ error: '보고서 등록에 실패했습니다.' }, { status: 500 })
  }

  // 근거 연결 — 제목 부분일치로 우리 DB 기사를 찾아 ai_report_sources 에 적재
  let sourcesSaved = 0
  const titles = (body.sourceTitles ?? []).filter(t => typeof t === 'string' && t.trim().length > 3)
  const unmatchedTitles: string[] = []
  if (titles.length > 0) {
    const contentIds = new Set<string>()
    for (const t of titles) {
      const { data } = await admin
        .from('contents')
        .select('id')
        .ilike('title', `%${t.trim().slice(0, 40)}%`)
        .limit(1)
      const id = (data ?? [])[0]?.id as string | undefined
      if (id) contentIds.add(id)
      else unmatchedTitles.push(t)
    }
    if (contentIds.size > 0) {
      const rows = [...contentIds].map(cid => ({ ai_report_id: inserted.id, content_id: cid }))
      const { error: srcError } = await admin.from('ai_report_sources').insert(rows)
      if (srcError) console.warn('[reports/import] 근거 연결 실패(무시):', srcError.message)
      else sourcesSaved = rows.length
    }
  }

  return NextResponse.json({
    ok: true,
    reportId: inserted.id,
    published: Boolean(body.publish),
    sourcesSaved,
    unmatchedTitles,
  })
}
