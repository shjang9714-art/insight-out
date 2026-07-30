import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * 커버 이미지를 report-covers 버킷에 업로드만 한다(DB update 없음).
 * 호출부가 thumbnail_url 기록 시점을 직접 결정할 때 사용(216 — 편집모달은 저장 시점에 기록).
 */
export async function uploadCoverFile(
  supabase: SupabaseClient,
  contentId: string,
  file: File | Blob,
  ext = 'jpg'
): Promise<string> {
  const tokenRes = await fetch('/api/admin/upload', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ filename: `cover.${ext}`, kind: 'cover', contentId }),
  })
  const tokenData: { token?: string; storagePath?: string; error?: string } = await tokenRes.json()
  if (!tokenRes.ok || !tokenData.token || !tokenData.storagePath) {
    throw new Error(tokenData.error ?? '업로드 URL 발급에 실패했습니다.')
  }

  const { error: uploadErr } = await supabase.storage
    .from('report-covers')
    .uploadToSignedUrl(tokenData.storagePath, tokenData.token, file)
  if (uploadErr) throw new Error(uploadErr.message)

  // 같은 경로 upsert라 URL이 동일해 브라우저 캐시로 옛 이미지가 보일 수 있음 → 쿼리로 무효화
  const cacheBuster = new Date().getTime()
  return `report-covers/${tokenData.storagePath}?v=${cacheBuster}`
}

/**
 * 커버 이미지를 업로드하고 contents.thumbnail_url 까지 즉시 기록한다.
 * 신규 콘텐츠 폼(insert 직후 즉시 persist가 정상인 경우)이 사용하는 헬퍼(215).
 */
export async function uploadCover(
  supabase: SupabaseClient,
  contentId: string,
  file: File | Blob,
  ext = 'jpg'
): Promise<string> {
  const storagePath = await uploadCoverFile(supabase, contentId, file, ext)

  const { error: updateErr } = await supabase
    .from('contents')
    .update({ thumbnail_url: storagePath })
    .eq('id', contentId)
  if (updateErr) throw new Error(updateErr.message)

  return storagePath
}
