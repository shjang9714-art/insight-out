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

export interface CopyImageOptions {
  /** 지정 시(>0) 품질게이트 활성화 — 트래킹픽셀/data:/svg URL 및 최소 해상도 미달 이미지를 스킵(null 반환) */
  minWidth?: number
  minHeight?: number
}

const LOW_QUALITY_URL_PATTERN = /(^|[/_.-])(1x1|pixel|spacer|blank|tracking|beacon)([/_.-]|$)/

/** data:/svg 및 트래킹 픽셀·플레이스홀더로 흔히 쓰이는 파일명 패턴을 가진 URL을 거른다(자동 수집 경로 전용, 관리자 수동 지정 시엔 미적용). */
function isLikelyLowQualityImageUrl(url: string): boolean {
  const lower = url.toLowerCase()
  if (lower.startsWith('data:')) return true
  if (lower.endsWith('.svg')) return true
  return LOW_QUALITY_URL_PATTERN.test(lower)
}

/**
 * 흔한 포맷(PNG/GIF/JPEG/WEBP)의 픽셀 치수를 헤더에서 직접 파싱한다(신규 의존성 없이).
 * 파싱 불가 포맷은 null(호출부에서 보수적으로 통과 처리 — 과도 배제 방지).
 */
function getImageDimensions(buf: Buffer): { width: number; height: number } | null {
  // PNG: 시그니처 8바이트 + IHDR 청크(width@16, height@20, big-endian)
  if (
    buf.length >= 24 &&
    buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47
  ) {
    return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) }
  }

  // GIF: "GIF87a"/"GIF89a" + width/height (little-endian, @6/@8)
  if (buf.length >= 10 && buf.toString('ascii', 0, 3) === 'GIF') {
    return { width: buf.readUInt16LE(6), height: buf.readUInt16LE(8) }
  }

  // JPEG: SOI 뒤 마커를 순회해 SOF(0xC0-0xCF, DHT/JPG/DAC 제외) 세그먼트에서 치수 추출
  if (buf.length >= 4 && buf[0] === 0xff && buf[1] === 0xd8) {
    let offset = 2
    while (offset + 9 < buf.length) {
      if (buf[offset] !== 0xff) { offset++; continue }
      const marker = buf[offset + 1]
      if (marker === 0xff) { offset++; continue }
      if ((marker >= 0xd0 && marker <= 0xd9) || marker === 0x01) {
        offset += 2
        continue
      }
      const segLen = buf.readUInt16BE(offset + 2)
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { height: buf.readUInt16BE(offset + 5), width: buf.readUInt16BE(offset + 7) }
      }
      offset += 2 + segLen
    }
  }

  // WEBP: "RIFF"...."WEBP" + VP8/VP8L/VP8X 청크
  if (buf.length >= 30 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') {
    const fmt = buf.toString('ascii', 12, 16)
    if (fmt === 'VP8 ') {
      return { width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff }
    }
    if (fmt === 'VP8L' && buf[20] === 0x2f) {
      const b0 = buf[21], b1 = buf[22], b2 = buf[23], b3 = buf[24]
      return {
        width: 1 + (((b1 & 0x3f) << 8) | b0),
        height: 1 + (((b3 & 0x0f) << 10) | (b2 << 2) | ((b1 & 0xc0) >> 6)),
      }
    }
    if (fmt === 'VP8X') {
      return {
        width: 1 + (buf[24] | (buf[25] << 8) | (buf[26] << 16)),
        height: 1 + (buf[27] | (buf[28] << 8) | (buf[29] << 16)),
      }
    }
  }

  return null
}

/**
 * 외부 이미지 URL을 서버에서 받아 report-covers/{contentId}.{ext} 로 업로드하고
 * contents.thumbnail_url 을 갱신한다. 성공 시 publicUrl, 실패 시 null(graceful, throw 없음).
 * admin은 service-role 클라이언트여야 한다(216·219 공유).
 * options 로 최소 해상도를 지정하면 품질게이트가 활성화된다(자동 수집 경로 전용 — 282).
 */
export async function copyExternalImageToCover(
  admin: SupabaseClient,
  contentId: string,
  imageUrl: string,
  options: CopyImageOptions = {},
): Promise<string | null> {
  const { minWidth = 0, minHeight = 0 } = options
  const gateEnabled = minWidth > 0 || minHeight > 0

  if (gateEnabled && isLikelyLowQualityImageUrl(imageUrl)) {
    return null
  }

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

  if (gateEnabled) {
    const dims = getImageDimensions(Buffer.from(arrayBuffer))
    if (dims && (dims.width < minWidth || dims.height < minHeight)) {
      return null
    }
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
