import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * GET /api/search/rag/status
 * 검색 AI 라우팅 활성 여부만 반환한다. LLM은 호출하지 않는다.
 */
export async function GET() {
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
    return NextResponse.json({ enabled: false }, { status: 401 })
  }

  try {
    const admin = createAdminClient()
    const { count, error } = await admin
      .from('llm_task_routing')
      .select('task_type', { count: 'exact', head: true })
      .eq('task_type', 'search')
      .eq('is_active', true)

    if (error) {
      console.error('[GET /api/search/rag/status] 라우팅 조회 오류:', error.message)
      return NextResponse.json({ enabled: false })
    }

    return NextResponse.json({ enabled: (count ?? 0) > 0 })
  } catch (err) {
    console.error(
      '[GET /api/search/rag/status] 오류:',
      err instanceof Error ? err.message : String(err),
    )
    return NextResponse.json({ enabled: false })
  }
}
