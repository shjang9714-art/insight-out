import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { createAdminClient } from '@/lib/supabase/admin'
import { sanitizeReportHtml } from '@/lib/reports/sanitize-html'
import { stripLlmArtifacts } from '@/lib/text/strip-llm-artifacts'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

async function verifyAdmin() {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return { error: NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 }) }
  }

  const { data: profile } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!profile || profile.role !== 'admin') {
    return { error: NextResponse.json({ error: '관리자 권한이 필요합니다.' }, { status: 403 }) }
  }

  return { error: null }
}

/**
 * GET /api/admin/reports/[id]
 * 어드민 미리보기용 전체 필드 조회(276). 서비스 상세(dashboard/reports/[id])는
 * 275에서 미발행이면 404이므로, 어드민 미리보기는 이 엔드포인트로 별도 조회한다.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { error: authError } = await verifyAdmin()
  if (authError) return authError

  const { id } = await params
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('ai_reports')
    .select('id, title, type, status, topic, prompt, summary, body_html, body_md, cover_image_url, publisher, published_at, error_message, created_at, updated_at')
    .eq('id', id)
    .single()

  if (error || !data) {
    return NextResponse.json({ error: '보고서를 찾을 수 없습니다.' }, { status: 404 })
  }

  const { data: sourcesData } = await admin
    .from('ai_report_sources')
    .select('content_id, issue_id')
    .eq('ai_report_id', id)

  const sourceIssueIds = (sourcesData ?? [])
    .map((s) => (s as { issue_id: string | null }).issue_id)
    .filter((v): v is string => Boolean(v))
  const contentIds = (sourcesData ?? [])
    .map((s) => (s as { content_id: string | null }).content_id)
    .filter((v): v is string => Boolean(v))

  const report = {
    ...data,
    summary: data.summary ? stripLlmArtifacts(data.summary) : null,
    body_md: data.body_md ? stripLlmArtifacts(data.body_md) : null,
  }

  // 어드민 미리보기도 sanitize 우회 금지(276 §7) — 클라이언트는 서버가 살균한 HTML만 받는다.
  const bodyHtmlSanitized = data.body_html ? sanitizeReportHtml(stripLlmArtifacts(data.body_html)) : null

  return NextResponse.json({ report, bodyHtmlSanitized, sourceIssueIds, contentIds })
}

/**
 * DELETE /api/admin/reports/[id]
 * 전략보고서 삭제(276). ai_report_sources 는 FK on delete cascade 로 함께 정리됨.
 * Storage 표지 파일은 남아도 무해(선택 정리, 지시서 §7).
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { error: authError } = await verifyAdmin()
  if (authError) return authError

  const { id } = await params
  const admin = createAdminClient()
  const { error } = await admin.from('ai_reports').delete().eq('id', id)

  if (error) {
    console.error('[admin/reports] 삭제 실패:', error)
    return NextResponse.json({ error: '삭제에 실패했습니다.' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
