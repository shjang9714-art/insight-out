import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { renderPageAsImage } from 'unpdf'
import { createCanvas, loadImage, type Canvas } from '@napi-rs/canvas'

/** 카드·상세에 충분하고 용량 과하지 않은 폭(285). 종횡비는 unpdf가 유지. */
const COVER_WIDTH = 1000
/** 1차 렌더 실패 시 재시도 폭(291) — 메모리·시간 초과 완화용으로 더 작게. */
const RETRY_COVER_WIDTH = 600
/** JPEG 재인코딩 품질(0~100 스케일 — @napi-rs/canvas). */
const JPEG_QUALITY = 80
/** 고유 색(5비트 양자화 기준) 개수가 이 값 이하이면 백지로 본다.
 *  백지의 본질은 면적 비율이 아니라 "색이 사실상 하나뿐"이라는 것 — 텍스트가 조금만
 *  있어도 안티에일리어싱으로 색이 수십 개가 되므로, 격자 면적 비율보다 이 지표가 정확하다(291). */
const DISTINCT_COLOR_MIN = 2

export type CoverResult =
  | { ok: true; url: string }
  | { ok: false; reason: 'render_failed' | 'blank_page' | 'upload_failed' | 'update_failed' }

/**
 * 렌더된 캔버스가 사실상 백지인지 판정한다(291).
 * 스캔 PDF 본문은 JBIG2·CCITT 등 팩스 압축 이미지인 경우가 많아, 서버리스 pdf.js가
 * 디코더를 못 찾으면 예외 없이 흰 화면을 반환할 수 있다 — 이를 성공으로 오판하지 않기 위한 가드.
 * 지표는 격자 면적 비율이 아니라 고유 색 개수 — 얇은 텍스트 한 줄은 격자 샘플링에서
 * 통째로 누락될 수 있지만, 색 개수 기준으로는 안티에일리어싱만으로도 확실히 잡힌다.
 * 성능: getImageData를 한 번만 호출해 전체를 순회하고, 고유 색이 임계값을 넘는 즉시 종료한다.
 */
function isBlankImage(canvas: Canvas): boolean {
  const { width, height } = canvas
  if (width === 0 || height === 0) return true

  const ctx = canvas.getContext('2d')
  const { data } = ctx.getImageData(0, 0, width, height)

  const seen = new Set<number>()
  for (let i = 0; i < data.length; i += 4) {
    // RGB 5비트 양자화(노이즈·압축 아티팩트 흡수)
    const quantized = ((data[i] >> 3) << 10) | ((data[i + 1] >> 3) << 5) | (data[i + 2] >> 3)
    seen.add(quantized)
    if (seen.size > DISTINCT_COLOR_MIN) return false
  }

  return seen.size <= DISTINCT_COLOR_MIN
}

/** width를 바꿔가며 1페이지 렌더를 시도한다. 실패 시 null(호출부가 재시도/실패 처리). */
async function tryRenderPage(pdf: Uint8Array, width: number): Promise<ArrayBuffer | null> {
  try {
    return await renderPageAsImage(pdf, 1, {
      canvasImport: () => import('@napi-rs/canvas'),
      width,
    })
  } catch (e) {
    console.error(`[PDF 커버] 렌더 실패(width=${width}):`, e instanceof Error ? e.message : String(e))
    return null
  }
}

/**
 * 업로드된 PDF의 1페이지를 이미지로 렌더해 report-covers/{contentId}.jpg 로 저장하고
 * contents.thumbnail_url 을 갱신한다(285). 실패 시 throw 없이 사유를 담은 결과를 반환한다(291).
 * 호출부가 thumbnail_url IS NULL 가드를 책임진다(수동 커버 보존) — 이 함수는 무조건 덮어쓴다.
 */
export async function coverFromPdfFirstPage(
  admin: SupabaseClient,
  contentId: string,
  pdf: Uint8Array,
): Promise<CoverResult> {
  try {
    let png = await tryRenderPage(pdf, COVER_WIDTH)
    if (!png) {
      // 견고화(291) — 더 작은 폭으로 1회 재시도(메모리·시간 초과 완화).
      png = await tryRenderPage(pdf, RETRY_COVER_WIDTH)
    }
    if (!png) {
      return { ok: false, reason: 'render_failed' }
    }

    const image = await loadImage(new Uint8Array(png))
    const canvas = createCanvas(image.width, image.height)
    const ctx = canvas.getContext('2d')
    ctx.drawImage(image, 0, 0, image.width, image.height)

    if (isBlankImage(canvas)) {
      console.warn(`[PDF 커버] 백지 판정(contentId=${contentId}) — 업로드하지 않음`)
      return { ok: false, reason: 'blank_page' }
    }

    const jpeg = canvas.toBuffer('image/jpeg', JPEG_QUALITY)

    console.log(`[PDF 커버] contentId=${contentId} png=${png.byteLength}B jpeg=${jpeg.length}B`)

    const storagePath = `${contentId}.jpg`
    const { error: uploadErr } = await admin.storage
      .from('report-covers')
      .upload(storagePath, jpeg, { upsert: true, contentType: 'image/jpeg' })
    if (uploadErr) {
      console.error('[PDF 커버] storage 업로드 실패:', uploadErr.message)
      return { ok: false, reason: 'upload_failed' }
    }

    const { data: pub } = admin.storage.from('report-covers').getPublicUrl(storagePath)
    // 같은 경로 upsert라 URL이 동일 → 캐시버스터 필수(216 규약과 동일)
    const thumbnailUrl = `${pub.publicUrl}?v=${Date.now()}`

    const { error: updateErr } = await admin
      .from('contents')
      .update({ thumbnail_url: thumbnailUrl })
      .eq('id', contentId)
    if (updateErr) {
      console.error('[PDF 커버] thumbnail_url 갱신 실패:', updateErr.message)
      return { ok: false, reason: 'update_failed' }
    }

    return { ok: true, url: thumbnailUrl }
  } catch (e) {
    console.error(`[PDF 커버] 생성 실패(contentId=${contentId}):`, e instanceof Error ? e.message : String(e))
    return { ok: false, reason: 'render_failed' }
  }
}
