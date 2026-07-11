import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { renderPageAsImage } from 'unpdf'
import { createCanvas, loadImage } from '@napi-rs/canvas'

/** 카드·상세에 충분하고 용량 과하지 않은 폭(285). 종횡비는 unpdf가 유지. */
const COVER_WIDTH = 1000
/** JPEG 재인코딩 품질(0~100 스케일 — @napi-rs/canvas). */
const JPEG_QUALITY = 80

/**
 * 업로드된 PDF의 1페이지를 이미지로 렌더해 report-covers/{contentId}.jpg 로 저장하고
 * contents.thumbnail_url 을 갱신한다(285). 실패 시 throw 없이 null(생성 풀·BrandedCover로 자연 폴백).
 * 호출부가 thumbnail_url IS NULL 가드를 책임진다(수동 커버 보존).
 */
export async function coverFromPdfFirstPage(
  admin: SupabaseClient,
  contentId: string,
  pdf: Uint8Array,
): Promise<string | null> {
  try {
    const png = await renderPageAsImage(pdf, 1, {
      canvasImport: () => import('@napi-rs/canvas'),
      width: COVER_WIDTH,
    })

    const image = await loadImage(new Uint8Array(png))
    const canvas = createCanvas(image.width, image.height)
    const ctx = canvas.getContext('2d')
    ctx.drawImage(image, 0, 0, image.width, image.height)
    const jpeg = canvas.toBuffer('image/jpeg', JPEG_QUALITY)

    console.log(`[PDF 커버] contentId=${contentId} png=${png.byteLength}B jpeg=${jpeg.length}B`)

    const storagePath = `${contentId}.jpg`
    const { error: uploadErr } = await admin.storage
      .from('report-covers')
      .upload(storagePath, jpeg, { upsert: true, contentType: 'image/jpeg' })
    if (uploadErr) {
      console.error('[PDF 커버] storage 업로드 실패:', uploadErr.message)
      return null
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
      return null
    }

    return thumbnailUrl
  } catch (e) {
    console.error(`[PDF 커버] 생성 실패(contentId=${contentId}):`, e instanceof Error ? e.message : String(e))
    return null
  }
}
