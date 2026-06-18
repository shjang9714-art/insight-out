import { NextResponse, type NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { createAdminClient } from '@/lib/supabase/admin'
import { extractPdfText, isScannedPdf, detectLang } from '@/lib/extract/pdf'
import { translateToKorean } from '@/lib/translate'
import { summarizeKo } from '@/lib/crawler/summarize'
import { matchIssues, type IssueMatchDef } from '@/lib/crawler/quality'

export const runtime    = 'nodejs'
export const dynamic    = 'force-dynamic'
export const maxDuration = 60

// ─── 관리자 확인 ───────────────────────────────────────────────────────────────

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

// ─── POST /api/admin/contents/[id]/extract ────────────────────────────────────

interface RouteParams {
  params: Promise<{ id: string }>
}

export async function POST(_req: NextRequest, { params }: RouteParams) {
  const authErr = await verifyAdmin()
  if (authErr) return authErr

  const { id } = await params
  const admin = createAdminClient()

  // 1. content 조회 — file_path 확인
  const { data: content, error: contentErr } = await admin
    .from('contents')
    .select('id, title, file_path, original_language')
    .eq('id', id)
    .single()

  if (contentErr || !content) {
    return NextResponse.json({ error: '콘텐츠를 찾을 수 없습니다.' }, { status: 404 })
  }

  const filePath: string | null = (content as { file_path: string | null }).file_path
  if (!filePath) {
    return NextResponse.json({ ok: false, reason: 'no_file', message: '파일 경로가 없습니다.' })
  }

  const isPdf = filePath.toLowerCase().endsWith('.pdf')
  if (!isPdf) {
    return NextResponse.json({ ok: false, reason: 'not_pdf', message: 'PDF 파일이 아닙니다.' })
  }

  // 2. Storage에서 PDF 다운로드 (service_role)
  const { data: fileData, error: dlErr } = await admin.storage
    .from('reports')
    .download(filePath)

  if (dlErr || !fileData) {
    console.error('[extract] Storage 다운로드 실패:', dlErr?.message)
    return NextResponse.json({ error: `PDF 다운로드 실패: ${dlErr?.message ?? '알 수 없는 오류'}` }, { status: 500 })
  }

  // 3. 텍스트 추출
  const buffer = new Uint8Array(await fileData.arrayBuffer())
  let bodyText: string
  try {
    bodyText = await extractPdfText(buffer)
  } catch (e) {
    console.error('[extract] PDF 텍스트 추출 실패:', e)
    return NextResponse.json({ error: 'PDF 텍스트 추출에 실패했습니다.' }, { status: 500 })
  }

  // 4. 스캔 PDF 임계 확인
  if (isScannedPdf(bodyText)) {
    return NextResponse.json({
      ok: false,
      reason: 'scanned',
      message: '텍스트 추출 결과가 너무 짧습니다. 스캔(이미지) PDF로 추정됩니다. OCR 처리가 필요합니다.',
      chars: bodyText.length,
    })
  }

  // 5. 언어 감지 및 번역
  const title: string = (content as { title: string }).title
  const lang = detectLang(bodyText)
  let bodyTranslatedKo: string | null = null
  let translated = false

  if (lang === 'en') {
    try {
      const TRANSLATE_MAX = 8000
      const textToTranslate = bodyText.slice(0, TRANSLATE_MAX)
      bodyTranslatedKo = await translateToKorean(textToTranslate)
      translated = bodyTranslatedKo !== null
    } catch (e) {
      console.error('[extract] 번역 실패 (계속 진행):', e)
    }
  }

  const koBody = bodyTranslatedKo ?? bodyText

  // 6. 요약 (try/catch — 실패해도 본문 적재 유지)
  let summarized = false
  let summaryKo: string | null = null
  try {
    if (koBody.length >= 100) {
      summaryKo = await summarizeKo(title, koBody)
      summarized = summaryKo !== null
    }
  } catch (e) {
    console.error('[extract] 요약 실패 (계속 진행):', e)
  }

  // 7. 엔티티 링킹 (try/catch)
  let entityCount = 0
  try {
    const { data: aliasData, error: aliasErr } = await admin
      .from('entity_aliases')
      .select('alias, entity_id')

    if (!aliasErr && aliasData && aliasData.length > 0) {
      const aliasMap = new Map<string, string>()
      for (const row of aliasData as { alias: string; entity_id: string }[]) {
        aliasMap.set(row.alias.toLowerCase(), row.entity_id)
      }

      const searchText = `${title} ${koBody}`.toLowerCase()
      const matchedEntityIds = [...new Set(
        [...aliasMap.entries()]
          .filter(([alias]) => searchText.includes(alias))
          .map(([, entityId]) => entityId)
      )]

      if (matchedEntityIds.length > 0) {
        const entityRows = matchedEntityIds.map(entity_id => ({
          content_id: id,
          entity_id,
          source: 'rule',
          score: 1.0,
        }))
        const { error: entErr } = await admin
          .from('content_entities')
          .upsert(entityRows, { onConflict: 'content_id,entity_id', ignoreDuplicates: true })
        if (entErr) {
          console.error('[extract] content_entities 적재 실패:', entErr.message)
        } else {
          entityCount = matchedEntityIds.length
        }
      }
    }
  } catch (e) {
    console.error('[extract] 엔티티 링킹 실패 (계속 진행):', e)
  }

  // 8. 이슈 매칭 (try/catch)
  let issueCount = 0
  try {
    const { data: issueData, error: issueErr } = await admin
      .from('issues')
      .select('id, match_keywords')
      .eq('status', 'published')

    if (!issueErr && issueData && issueData.length > 0) {
      const issueList = issueData as IssueMatchDef[]
      const matchedIssueIds = matchIssues(title, koBody, issueList)

      if (matchedIssueIds.length > 0) {
        const issueRows = matchedIssueIds.map(issue_id => ({
          issue_id,
          content_id: id,
          source: 'rule',
        }))
        const { error: issueUpsertErr } = await admin
          .from('issue_contents')
          .upsert(issueRows, { onConflict: 'issue_id,content_id', ignoreDuplicates: true })
        if (issueUpsertErr) {
          console.error('[extract] issue_contents 적재 실패:', issueUpsertErr.message)
        } else {
          issueCount = matchedIssueIds.length
        }
      }
    }
  } catch (e) {
    console.error('[extract] 이슈 매칭 실패 (계속 진행):', e)
  }

  // 9. content 업데이트
  const updatePayload: Record<string, unknown> = {
    body_original:    bodyText,
    original_language: lang,
    body_fetched_at:  new Date().toISOString(),
  }
  if (bodyTranslatedKo) updatePayload.body_translated_ko = bodyTranslatedKo
  if (summaryKo)        updatePayload.summary_ko = summaryKo

  const { error: updateErr } = await admin
    .from('contents')
    .update(updatePayload)
    .eq('id', id)

  if (updateErr) {
    console.error('[extract] contents 업데이트 실패:', updateErr.message)
    return NextResponse.json({ error: `본문 저장 실패: ${updateErr.message}` }, { status: 500 })
  }

  return NextResponse.json({
    ok: true,
    chars: bodyText.length,
    lang,
    translated,
    summarized,
    entities: entityCount,
    issues: issueCount,
  })
}
