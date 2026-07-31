import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { createAdminClient } from '@/lib/supabase/admin'
import { answerQuestion } from '@/lib/search/rag-answer'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * POST /api/search/rag
 * 인증된 사용자 전용. 질문 → RAG 답변.
 */
export async function POST(request: NextRequest) {
  // 인증 확인 (일반 사용자 — 어드민 아님)
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(toSet) {
          toSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })
  }

  const { data: profile } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single()
  const isAdmin = profile?.role === 'admin'

  // 요청 바디
  let question: string
  try {
    const body = await request.json() as { question?: unknown }
    question = typeof body.question === 'string' ? body.question.trim() : ''
  } catch {
    return NextResponse.json({ error: '잘못된 요청 형식입니다.' }, { status: 400 })
  }

  if (!question) {
    return NextResponse.json({ error: '질문을 입력해주세요.' }, { status: 400 })
  }
  if (question.length > 500) {
    return NextResponse.json({ error: '질문이 너무 깁니다. (최대 500자)' }, { status: 400 })
  }

  try {
    const admin = createAdminClient()
    const result = await answerQuestion(admin, question)

    // detail(내부 실패 원인)은 관리자에게만 노출한다 — 일반 사용자에게 내부 오류 상세를 흘리지 않는다.
    if ('detail' in result && result.detail !== undefined && !isAdmin) {
      return NextResponse.json({ answer: result.answer, reason: result.reason })
    }
    return NextResponse.json(result)
  } catch (err) {
    console.error('[POST /api/search/rag] 오류:', err instanceof Error ? err.message : String(err))
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 })
  }
}
