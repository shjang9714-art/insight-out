import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { createAdminClient } from '@/lib/supabase/admin'
import { PROMPT_CATALOG } from '@/lib/prompts/catalog'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * 350 — 통합 프롬프트 콘솔.
 * 프롬프트를 쓰는 모든 AI 생성기가 llm_prompts(key·label·prompt_text)를 우선 읽고 코드 상수로 폴백한다.
 * 이 라우트는 그 테이블을 어드민에서 목록·편집·저장하게 한다.
 * GET   : 카탈로그(코드가 아는 모든 key) + DB 저장값 병합
 * PATCH : { key, prompt_text, label? } upsert
 */

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
    return { error: NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 }) }
  }
  const { data: profile } = await supabase.from('users').select('role').eq('id', user.id).single()
  if (!profile || profile.role !== 'admin') {
    return { error: NextResponse.json({ error: '관리자 권한이 필요합니다.' }, { status: 403 }) }
  }
  return { error: null }
}

interface DbPromptRow { key: string; label: string | null; prompt_text: string; updated_at: string }

export async function GET() {
  const { error } = await verifyAdmin()
  if (error) return error

  const admin = createAdminClient()
  const { data, error: dbError } = await admin
    .from('llm_prompts')
    .select('key, label, prompt_text, updated_at')

  if (dbError && dbError.code !== '42P01') {
    console.error('[prompts] 목록 조회 실패:', dbError.message)
    return NextResponse.json({ error: '프롬프트를 불러오지 못했습니다.' }, { status: 500 })
  }

  // 42P01(테이블 미적용)이면 DB 없이 카탈로그 기본값만 노출
  const rows = (dbError ? [] : (data ?? [])) as DbPromptRow[]
  const byKey = new Map(rows.map(r => [r.key, r]))

  // 카탈로그(코드가 아는 key) 기준으로 병합 — DB에 없으면 코드 기본값·미저장 표시
  const prompts = PROMPT_CATALOG.map(entry => {
    const db = byKey.get(entry.key)
    return {
      key: entry.key,
      label: db?.label ?? entry.label,
      group: entry.group,
      description: entry.description,
      /** DB에 저장돼 실제 사용 중인 값. 없으면 코드 상수 폴백이 쓰인다. */
      promptText: db?.prompt_text ?? entry.fallback,
      /** DB 저장 여부 — false면 코드 상수 폴백이 현재 사용 중 */
      saved: Boolean(db),
      updatedAt: db?.updated_at ?? null,
      fallback: entry.fallback,
    }
  })

  // 카탈로그에 없는데 DB에만 있는 key(라우팅·모델설정 등)는 노출하지 않는다 — 프롬프트만.
  return NextResponse.json({ prompts, tableApplied: !dbError })
}

interface PatchBody { key?: unknown; prompt_text?: unknown; label?: unknown }

export async function PATCH(request: NextRequest) {
  const { error: authError } = await verifyAdmin()
  if (authError) return authError

  let body: PatchBody
  try {
    body = await request.json() as PatchBody
  } catch {
    return NextResponse.json({ error: '요청 형식이 올바르지 않습니다.' }, { status: 400 })
  }

  const key = typeof body.key === 'string' ? body.key.trim() : ''
  const promptText = typeof body.prompt_text === 'string' ? body.prompt_text : ''
  if (!key || !PROMPT_CATALOG.some(e => e.key === key)) {
    return NextResponse.json({ error: '알 수 없는 프롬프트 key 입니다.' }, { status: 400 })
  }
  if (!promptText.trim()) {
    return NextResponse.json({ error: '프롬프트 내용이 비어 있습니다.' }, { status: 400 })
  }

  const entry = PROMPT_CATALOG.find(e => e.key === key)!
  const label = typeof body.label === 'string' && body.label.trim() ? body.label.trim() : entry.label

  const admin = createAdminClient()
  const { error: upsertError } = await admin
    .from('llm_prompts')
    .upsert({ key, label, prompt_text: promptText, updated_at: new Date().toISOString() }, { onConflict: 'key' })

  if (upsertError) {
    const reason = upsertError.code === '42P01' ? 'llm_prompts 테이블이 없습니다(253 SQL 미적용).' : upsertError.message
    console.error('[prompts] 저장 실패:', upsertError.message)
    return NextResponse.json({ error: reason }, { status: 500 })
  }

  return NextResponse.json({ ok: true, key })
}
