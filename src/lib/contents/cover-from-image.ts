import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'

const MAX_BYTES = 5 * 1024 * 1024

const EXT_BY_CONTENT_TYPE: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg':  'jpg',
  'image/png':  'png',
  'image/webp': 'webp',
  'image/gif':  'gif',
}

/**
 * 외부 이미지 URL을 서버에서 받아 report-covers/{contentId}.{ext} 로 업로드하고
 * contents.thumbnail_url 을 갱신한다. 성공 시 publicUrl, 실패 시 null(graceful, throw 없음).
 * admin은 service-role 클라이언트여야 한다(216·219 공유).
 */
export async function copyExternalImageToCover(
  admin: SupabaseClient,
  contentId: string,
  imageUrl: string,
): Promise<string | null> {
  let parsedUrl: URL
  try {
    parsedUrl = new URL(imageUrl)
  } catch {
    return null
  }
  if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
    return null
  }

  let imageRes: Response
  try {
    imageRes = await fetch(parsedUrl.toString(), { signal: AbortSignal.timeout(8000) })
  } catch (err) {
    console.error('[cover-from-image] fetch 실패:', err)
    return null
  }
  if (!imageRes.ok) {
    return null
  }

  const contentType = imageRes.headers.get('content-type')?.split(';')[0].trim().toLowerCase() ?? ''
  const ext = EXT_BY_CONTENT_TYPE[contentType]
  if (!ext) {
    return null
  }

  const arrayBuffer = await imageRes.arrayBuffer()
  if (arrayBuffer.byteLength === 0 || arrayBuffer.byteLength > MAX_BYTES) {
    return null
  }

  const storagePath = `${contentId}.${ext}`
  const { error: uploadErr } = await admin.storage
    .from('report-covers')
    .upload(storagePath, arrayBuffer, { upsert: true, contentType })
  if (uploadErr) {
    console.error('[cover-from-image] storage 업로드 실패:', uploadErr)
    return null
  }

  const { data: pub } = admin.storage.from('report-covers').getPublicUrl(storagePath)
  const thumbnailUrl = `${pub.publicUrl}?v=${Date.now()}`

  const { error: updateErr } = await admin
    .from('contents')
    .update({ thumbnail_url: thumbnailUrl })
    .eq('id', contentId)
  if (updateErr) {
    console.error('[cover-from-image] thumbnail_url 갱신 실패:', updateErr)
    return null
  }

  return thumbnailUrl
}
