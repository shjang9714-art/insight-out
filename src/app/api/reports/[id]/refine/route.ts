import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { llmComplete } from '@/lib/llm'

const JUDGEMENT_ANCHOR = '## 3. 시사점'
const SOURCE_ANCHOR    = '## 근거 콘텐츠'
const MAX_BODY_CHARS   = 100_000

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

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

  const { data: reportData } = await supabase
    .from('ai_reports')
    .select('id, user_id, type, body_md')
    .eq('id', id)
    .single()

  if (!reportData) {
    return NextResponse.json({ error: '보고서를 찾을 수 없습니다.' }, { status: 404 })
  }
  if (reportData.user_id !== user.id) {
    return NextResponse.json({ error: '본인 보고서만 수정할 수 있습니다.' }, { status: 403 })
  }

  const bodyMd: string = reportData.body_md ?? ''
  const type: string   = reportData.type ?? '시장동향'

  // ── 사실 섹션 추출(§3 앵커 이전) ─────────────────────────────────────────
  const anchorIdx = bodyMd.indexOf(JUDGEMENT_ANCHOR)
  const factPart  = anchorIdx >= 0 ? bodyMd.slice(0, anchorIdx).trimEnd() : bodyMd

  // ── 근거 콘텐츠 섹션 보존 ────────────────────────────────────────────────
  const sourceIdx   = bodyMd.indexOf(SOURCE_ANCHOR)
  const sourcePart  = sourceIdx >= 0 ? '\n\n' + bodyMd.slice(sourceIdx) : ''

  // ── LLM 호출 ─────────────────────────────────────────────────────────────
  const system =
    '당신은 LG U+ B2B 사업 담당자를 위한 전략 분석가입니다. ' +
    '주어진 보고서의 사실(개요·동향)만 근거로, 판단 섹션을 한국어로 작성합니다. ' +
    '사실에 없는 회사명·수치·날짜를 새로 만들지 마세요. ' +
    '추정은 "일반적으로", "추정" 등으로 명시하세요. ' +
    '마크다운으로만 답하세요.'

  const userPrompt =
    `보고서 유형: ${type}\n\n` +
    `[사실 근거]\n${factPart}\n\n` +
    `[작성 요청]\n아래 세 섹션을 위 사실에서 논리적으로 도출해 작성하세요. ` +
    `다른 머리말 없이 이 형식 그대로:\n` +
    `## 3. 시사점 (LG U+ 관점)\n(사업 시사점 1~3개)\n` +
    `## 4. 기회 / 리스크\n(기회·리스크)\n` +
    `## 5. 대응 방향\n(실행 가능한 대응 1~3개)`

  const out = await llmComplete('report', system, userPrompt)
  if (!out) {
    return NextResponse.json(
      { error: 'LLM 키가 설정되지 않았거나 한도를 초과했습니다. /admin/llm 에서 설정을 확인하세요.' },
      { status: 503 },
    )
  }

  // ── 판단 섹션 치환 ────────────────────────────────────────────────────────
  let newBody: string
  if (anchorIdx >= 0) {
    // 사실 섹션 + LLM 출력 + 근거 콘텐츠
    newBody = factPart + '\n\n' + out.trim() + sourcePart
  } else {
    // 앵커 없으면 append
    newBody = bodyMd.trimEnd() + '\n\n' + out.trim() + sourcePart
  }

  if (newBody.length > MAX_BODY_CHARS) {
    return NextResponse.json(
      { error: '생성된 본문이 너무 깁니다(10만자 초과). 기존 내용을 줄인 후 다시 시도해주세요.' },
      { status: 400 },
    )
  }

  const { error: updateErr } = await supabase
    .from('ai_reports')
    .update({ body_md: newBody })
    .eq('id', id)

  if (updateErr) {
    console.error('[refine] update error:', updateErr)
    return NextResponse.json(
      { error: '보고서 저장에 실패했습니다. 잠시 후 다시 시도해주세요.' },
      { status: 500 },
    )
  }

  return NextResponse.json({ ok: true })
}
