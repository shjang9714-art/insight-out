import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * 커버 이미지를 report-covers 버킷에 업로드하고 contents.thumbnail_url 을 갱신한다.
 * 편집 모달·PDF 자동 표지·업로드 폼이 공유하는 헬퍼(215). contentId 필요.
 */
export async function uploadCover(
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

  const { data: pub } = supabase.storage.from('report-covers').getPublicUrl(tokenData.storagePath)
  // 같은 경로 upsert라 URL이 동일해 브라우저 캐시로 옛 이미지가 보일 수 있음 → 쿼리로 무효화
  const cacheBuster = new Date().getTime()
  const publicUrl = `${pub.publicUrl}?v=${cacheBuster}`

  const { error: updateErr } = await supabase
    .from('contents')
    .update({ thumbnail_url: publicUrl })
    .eq('id', contentId)
  if (updateErr) throw new Error(updateErr.message)

  return publicUrl
}
