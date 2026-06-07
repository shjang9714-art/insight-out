import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse, type NextRequest } from 'next/server'
import { parseSourceImport, SourceImportParseError } from '@/lib/sources/import'
import type {
  SourceImportFormat,
  SourceImportMode,
} from '@/lib/sources/types'
import {
  insertValidatedSources,
  summarizeSourceImport,
  validateSourceRows,
} from '@/lib/sources/validation'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

async function verifyAdmin() {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          )
        },
      },
    }
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })
  }

  const { data: profile } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'admin') {
    return NextResponse.json(
      { error: '관리자 권한이 필요합니다.' },
      { status: 403 }
    )
  }

  return null
}

function isFormat(value: unknown): value is SourceImportFormat {
  return value === undefined || value === 'auto' || value === 'csv' || value === 'tsv'
}

function isMode(value: unknown): value is SourceImportMode {
  return value === 'validate' || value === 'commit'
}

export async function POST(request: NextRequest) {
  const authError = await verifyAdmin()
  if (authError) return authError

  let body: { text?: unknown; format?: unknown; mode?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json(
      { error: '요청 형식이 올바르지 않습니다.' },
      { status: 400 }
    )
  }

  if (typeof body.text !== 'string' || !body.text.trim()) {
    return NextResponse.json(
      { error: '등록할 CSV 또는 TSV 내용을 입력해주세요.' },
      { status: 400 }
    )
  }
  if (!isFormat(body.format) || !isMode(body.mode)) {
    return NextResponse.json(
      { error: '파일 형식 또는 실행 모드가 올바르지 않습니다.' },
      { status: 400 }
    )
  }

  try {
    const parsedRows = parseSourceImport(
      body.text,
      (body.format ?? 'auto') as SourceImportFormat
    )
    const admin = createAdminClient()
    const validation = await validateSourceRows(admin, parsedRows)
    const rows =
      body.mode === 'commit'
        ? await insertValidatedSources(admin, validation)
        : validation.rows

    return NextResponse.json({
      rows,
      summary: summarizeSourceImport(rows),
    })
  } catch (error) {
    const message =
      error instanceof SourceImportParseError
        ? error.message
        : '소스 대량 등록 처리 중 오류가 발생했습니다.'
    if (!(error instanceof SourceImportParseError)) {
      console.error('[api/admin/sources/import] 처리 실패:', error)
    }
    return NextResponse.json(
      { error: message },
      { status: error instanceof SourceImportParseError ? 400 : 500 }
    )
  }
}
