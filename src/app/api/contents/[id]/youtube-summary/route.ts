import { NextRequest } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { createAdminClient } from '@/lib/supabase/admin'
import { llmComplete } from '@/lib/llm'

const SYSTEM_PROMPT =
  '당신은 B2B 텔레콤/엔터프라이즈 시장 정보 분석가다. ' +
  '입력된 유튜브 영상의 제목과 채널명만으로 이 영상의 핵심 내용을 한국어 3~5줄로 추정 요약하라. ' +
  '자막 없이 제목 기반 추정임을 감안해 과장 없이 작성하라. 요약문만 출력(머리말·따옴표·목록 금지).'

/** 유튜브 상세의 "주요 내용" 온디맨드 생성 — summary_ko 없을 때만 LLM 호출, 성공 시 DB 에 캐시. */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(toSet) {
          toSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          )
        },
      },
    }
  )

  const { data } = await supabase
    .from('contents')
    .select('id, title, summary_ko, category, sources(name)')
    .eq('id', id)
    .eq('status', 'published')
    .eq('category', '유튜브')
    .single()

  if (!data) {
    return Response.json({ status: 'failed', summary: null }, { status: 404 })
  }

  if (data.summary_ko) {
    return Response.json({ status: 'done', summary: data.summary_ko })
  }

  try {
    const sourcesField = data.sources as { name: string } | { name: string }[] | null
    const channelName = (Array.isArray(sourcesField) ? sourcesField[0]?.name : sourcesField?.name) ?? ''
    const user = `제목: ${data.title}${channelName ? `\n채널: ${channelName}` : ''}`
    const out = await llmComplete('summarize', SYSTEM_PROMPT, user)
    const summary = out?.trim() || null

    if (summary) {
      const admin = createAdminClient()
      await admin.from('contents').update({ summary_ko: summary }).eq('id', id)
    }

    return Response.json({ status: summary ? 'done' : 'empty', summary })
  } catch {
    return Response.json({ status: 'failed', summary: null })
  }
}
