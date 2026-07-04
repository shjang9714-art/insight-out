import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  type OpsRequestRow,
  type OpsRequestStatus,
  REQUEST_STATUS_LABEL,
  STATUS_EMOJI,
  groupWorkByPhase,
} from '@/lib/admin/ops-requests'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// verifyAdmin: requests/route.ts 와 동일하게 복제 (공통 추출은 추후)
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
    return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })
  }

  const { data: profile } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!profile || profile.role !== 'admin') {
    return NextResponse.json({ error: '관리자 권한이 필요합니다.' }, { status: 403 })
  }

  return null
}

const TABLE_MISSING_CODE = '42P01'
const COLUMN_MISSING_CODE = '42703'

function buildMarkdown(grouped: [string, OpsRequestRow[]][], generatedAt: string): string {
  const lines: string[] = []
  lines.push('# 📋 작업계획서 (DB 스냅샷)')
  lines.push('')
  lines.push('## 🚦 진행 상태 범례')
  lines.push('| 신호등 | 의미 |')
  lines.push('|:---:|---|')
  lines.push(`| ${STATUS_EMOJI.done} | **완료** |`)
  lines.push(`| ${STATUS_EMOJI.in_progress} | **진행 중** |`)
  lines.push(`| ${STATUS_EMOJI.pending} | **대기** |`)
  lines.push(`| ${STATUS_EMOJI.blocked} | **블록** |`)
  lines.push('')

  if (grouped.length === 0) {
    lines.push('_등록된 작업이 없습니다._')
    lines.push('')
  }

  for (const [phase, items] of grouped) {
    lines.push(`## ${phase}`)
    for (const item of items) {
      const status = item.status as OpsRequestStatus
      const emoji = STATUS_EMOJI[status] ?? '⚪'
      const refPart = item.ref ? ` [${item.ref}]` : ''
      const notePart = item.body ? ` · ${item.body.split('\n')[0]}` : ''
      lines.push(`- ${emoji} ${item.title}${refPart}${notePart}`)
    }
    lines.push('')
  }

  lines.push('---')
  lines.push(`*생성: ${generatedAt} — DB(ops_requests) 스냅샷*`)
  lines.push('')

  return lines.join('\n')
}

/**
 * GET /api/admin/worklog/export[?format=json]
 * ops_requests(post_type='work') 전체를 조회해 작업계획서.md 형식 마크다운으로 반환.
 * 배포 앱은 파일을 쓰지 않음 — 생성·반환만(커밋은 로컬에서 Sonnet이 수행).
 * phase/seq 컬럼 미적용(42703) 또는 테이블 미적용(42P01) → graceful.
 */
export async function GET(req: NextRequest) {
  const authError = await verifyAdmin()
  if (authError) return authError

  const format = req.nextUrl.searchParams.get('format')

  try {
    const admin = createAdminClient()
    const { data, error } = await admin
      .from('ops_requests')
      .select('*')
      .eq('post_type', 'work')

    if (error) {
      if (error.code === TABLE_MISSING_CODE || error.code === COLUMN_MISSING_CODE) {
        const emptyMd = buildMarkdown([], new Date().toISOString())
        return format === 'json'
          ? NextResponse.json({ groups: [], tableReady: false })
          : new NextResponse(emptyMd, { headers: { 'Content-Type': 'text/markdown; charset=utf-8' } })
      }
      throw error
    }

    const rows = (data ?? []) as OpsRequestRow[]
    const grouped = groupWorkByPhase(rows)
    const generatedAt = new Date().toISOString()

    if (format === 'json') {
      return NextResponse.json({
        tableReady: true,
        generatedAt,
        groups: grouped.map(([phase, items]) => ({
          phase,
          items: items.map((i) => ({
            id: i.id,
            title: i.title,
            status: i.status,
            ref: i.ref,
            owner: i.owner,
            note: i.body,
            seq: i.seq,
          })),
        })),
        labels: REQUEST_STATUS_LABEL,
      })
    }

    const markdown = buildMarkdown(grouped, generatedAt)
    return new NextResponse(markdown, {
      headers: { 'Content-Type': 'text/markdown; charset=utf-8' },
    })
  } catch (err) {
    console.error('[/api/admin/worklog/export] 오류(graceful):', err)
    const emptyMd = buildMarkdown([], new Date().toISOString())
    return format === 'json'
      ? NextResponse.json({ groups: [], tableReady: false })
      : new NextResponse(emptyMd, { headers: { 'Content-Type': 'text/markdown; charset=utf-8' } })
  }
}
