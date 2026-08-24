import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { createAdminClient } from '@/lib/supabase/admin'
import { generateStrategyReport } from '@/lib/reports/generate-strategy'
import type { AiReportType } from '@/lib/types'
import { isAdminRole } from '@/lib/admin/capabilities'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const REPORT_TYPES: AiReportType[] = ['시장동향', '경쟁사분석', '키워드분석', '서비스리포트', '자유주제']

async function verifyAdmin(): Promise<{ error: NextResponse | null; userId?: string }> {
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

  if (!isAdminRole(profile?.role)) {
    return { error: NextResponse.json({ error: '관리자 권한이 필요합니다.' }, { status: 403 }) }
  }

  return { error: null, userId: user.id }
}

interface GenerateStrategyBody {
  reportId?: string
  type?: AiReportType
  topic?: string
  title?: string
  sourceIssueIds?: string[]
  contentIds?: string[]
  promptOverride?: string
}

/**
 * POST /api/reports/generate-strategy
 * body: { reportId?, type, topic, title?, sourceIssueIds?, contentIds?, promptOverride? }
 * 전략보고서 AI HTML 생성/재생성 트리거(274, 어드민 전용).
 */
export async function POST(request: NextRequest) {
  try {
    const { error: authError, userId } = await verifyAdmin()
    if (authError) return authError

    let body: GenerateStrategyBody
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: '요청 형식이 올바르지 않습니다.' }, { status: 400 })
    }

    if (!body.type || !REPORT_TYPES.includes(body.type)) {
      return NextResponse.json({ error: '유효하지 않은 보고서 유형입니다.' }, { status: 400 })
    }
    if (!body.topic?.trim()) {
      return NextResponse.json({ error: '주제를 입력해주세요.' }, { status: 400 })
    }

    const admin = createAdminClient()
    const result = await generateStrategyReport(admin, {
      reportId: body.reportId,
      userId: userId!,
      type: body.type,
      topic: body.topic.trim(),
      title: body.title,
      sourceIssueIds: body.sourceIssueIds ?? [],
      contentIds: body.contentIds ?? [],
      promptOverride: body.promptOverride,
    })

    return NextResponse.json(result)
  } catch (err) {
    console.error('[generate-strategy]', err)
    return NextResponse.json({ error: 'AI 리포트 생성 중 오류가 발생했습니다.' }, { status: 500 })
  }
}
