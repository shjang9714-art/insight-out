import { NextResponse, type NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  TRANSLATION_SEPARATOR,
  translateToKorean,
} from '@/lib/translate'
import { runJob } from '@/lib/jobs/run-job'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

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
    return {
      error: NextResponse.json(
        { error: '로그인이 필요합니다.' },
        { status: 401 }
      ),
      userId: null,
    }
  }

  const { data: profile } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!profile || profile.role !== 'admin') {
    return {
      error: NextResponse.json(
        { error: '관리자 권한이 필요합니다.' },
        { status: 403 }
      ),
      userId: null,
    }
  }

  return { error: null, userId: user.id }
}

/**
 * POST /api/admin/translate-backfill?limit=20
 * 기존 영문 기사(body_translated_ko IS NULL) 소급 번역.
 */
export async function POST(request: NextRequest) {
  const { error: authError, userId } = await verifyAdmin()
  if (authError) return authError

  const limitParam = request.nextUrl.searchParams.get('limit')
  const limit = Math.min(Math.max(parseInt(limitParam || '20', 10) || 20, 1), 50)

  const admin = createAdminClient()

  try {
    const result = await runJob(admin, { key: 'admin:translate-backfill', trigger: 'admin', startedBy: userId ?? undefined }, async () => {
      const { data: targets, error: queryError } = await admin
        .from('contents')
        .select('id, title, body_original')
        .eq('original_language', 'en')
        .is('body_translated_ko', null)
        .order('collected_at', { ascending: false })
        .limit(limit)

      if (queryError) {
        throw new Error('대상 조회 실패: ' + queryError.message)
      }

      if (!targets || targets.length === 0) {
        const { count } = await admin
          .from('contents')
          .select('id', { count: 'exact', head: true })
          .eq('original_language', 'en')
          .is('body_translated_ko', null)

        return { processed: 0, translated: 0, skipped: 0, remaining: count ?? 0 }
      }

      let translated = 0
      let skipped = 0

      for (const row of targets) {
        const body = row.body_original
        if (!body) {
          skipped++
          console.log(`[백필] id=${row.id} 본문 없음, 건너뜀`)
          continue
        }

        const combined = `${row.title}${TRANSLATION_SEPARATOR}${body}`
        const translateResult = await translateToKorean(combined)

        if (!translateResult) {
          skipped++
          console.log(`[백필] id=${row.id} 번역 실패, 건너뜀`)
          continue
        }

        const separatorIndex = translateResult.indexOf(TRANSLATION_SEPARATOR)
        if (separatorIndex < 0) {
          skipped++
          console.warn(`[백필] id=${row.id} 구분자 미발견, 건너뜀`)
          continue
        }

        const translatedTitle = translateResult.slice(0, separatorIndex).trim()
        const translatedBody = translateResult.slice(separatorIndex + TRANSLATION_SEPARATOR.length).trim()

        if (!translatedTitle || !translatedBody) {
          skipped++
          console.warn(`[백필] id=${row.id} 번역 결과 비어 있음, 건너뜀`)
          continue
        }

        const { error: updateError } = await admin
          .from('contents')
          .update({
            title: translatedTitle,
            title_original: row.title,
            body_translated_ko: translatedBody,
          })
          .eq('id', row.id)

        if (updateError) {
          skipped++
          console.error(`[백필] id=${row.id} 업데이트 실패:`, updateError.message)
          continue
        }

        translated++
        console.log(`[백필] id=${row.id} 번역 완료`)
      }

      const { count: remaining } = await admin
        .from('contents')
        .select('id', { count: 'exact', head: true })
        .eq('original_language', 'en')
        .is('body_translated_ko', null)

      return {
        processed: targets.length,
        translated,
        skipped,
        remaining: remaining ?? 0,
      }
    })

    return NextResponse.json(result)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
