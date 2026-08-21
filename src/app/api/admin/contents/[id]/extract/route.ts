import { verifyAdminRequest } from '@/lib/admin/verify-admin-request'
import { NextResponse, type NextRequest } from 'next/server'
import { extractPdfText, isScannedPdf, detectLang } from '@/lib/extract/pdf'
import { translateToKorean } from '@/lib/translate'
import { summarizeKo } from '@/lib/crawler/summarize'
import { matchIssues, patternHit, type IssueMatchDef } from '@/lib/crawler/quality'
import { coverFromPdfFirstPage } from '@/lib/contents/cover-from-pdf'
import { loadEntityAliasMap } from '@/lib/entities/alias-map'

export const runtime    = 'nodejs'
export const dynamic    = 'force-dynamic'
export const maxDuration = 60

// ─── 관리자 확인 ───────────────────────────────────────────────────────────────


// ─── POST /api/admin/contents/[id]/extract ────────────────────────────────────

interface RouteParams {
  params: Promise<{ id: string }>
}

export async function POST(_req: NextRequest, { params }: RouteParams) {
  const gate = await verifyAdminRequest()
  if (!gate.ok) return gate.response

  const { id } = await params
  const admin = gate.admin

  // 1. content 조회 — file_path 확인 (thumbnail_url 은 285 커버 가드용)
  const { data: content, error: contentErr } = await admin
    .from('contents')
    .select('id, title, file_path, original_language, thumbnail_url, summary_ko')
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

  const buffer = new Uint8Array(await fileData.arrayBuffer())

  // 2.5. PDF 1페이지 표지 자동 설정(285) — 텍스트 추출 성공/실패와 무관하게 독립 시도.
  //   스캔 PDF의 조기 return(§4) 보다 반드시 앞에 둔다 — 스캔 PDF야말로 텍스트는 못 뽑아도
  //   표지 이미지는 멀쩡한, 커버 자동추출의 가장 큰 이득 케이스다.
  //   thumbnail_url 이 이미 있으면(수동 커버 등) 절대 덮지 않는다.
  let coverSet = false
  let coverReason: string | undefined
  const existingThumbnailUrl = (content as { thumbnail_url: string | null }).thumbnail_url
  if (!existingThumbnailUrl) {
    try {
      const coverResult = await coverFromPdfFirstPage(admin, id, buffer)
      coverSet = coverResult.ok
      if (!coverResult.ok) coverReason = coverResult.reason
    } catch (e) {
      console.error('[extract] PDF 커버 생성 실패 (계속 진행):', e)
      coverReason = 'render_failed'
    }
  }

  // 3. 텍스트 추출
  let bodyText: string
  try {
    bodyText = await extractPdfText(buffer)
  } catch (e) {
    console.error('[extract] PDF 텍스트 추출 실패:', e)
    return NextResponse.json({ error: 'PDF 텍스트 추출에 실패했습니다.', coverSet, coverReason }, { status: 500 })
  }

  // 4. 스캔 PDF 임계 확인
  if (isScannedPdf(bodyText)) {
    return NextResponse.json({
      ok: false,
      reason: 'scanned',
      message: '텍스트 추출 결과가 너무 짧습니다. 스캔(이미지) PDF로 추정됩니다. OCR 처리가 필요합니다.',
      chars: bodyText.length,
      coverSet,
      coverReason,
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
  const existingSummary = (content as { summary_ko: string | null }).summary_ko
  try {
    if (!existingSummary && koBody.length >= 100) {
      summaryKo = (await summarizeKo(title, koBody)).text
      summarized = summaryKo !== null
    }
  } catch (e) {
    console.error('[extract] 요약 실패 (계속 진행):', e)
  }

  // 7. 엔티티 링킹 (try/catch)
  let entityCount = 0
  try {
    const aliasMap = await loadEntityAliasMap(admin)
    if (aliasMap.size > 0) {
      const searchText = `${title} ${koBody}`.toLowerCase()
      const matchedEntityIds = [...new Set(
        [...aliasMap.entries()]
          .filter(([alias]) => patternHit(searchText, alias))
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
    coverSet,
    coverReason,
  })
}
