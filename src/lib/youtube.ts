/** 유튜브 URL(watch/단축 링크)에서 video_id 추출. 실패 시 null. */
export function extractVideoId(url: string | null): string | null {
  if (!url) return null
  try {
    const u = new URL(url)
    if (u.hostname.includes('youtube.com')) return u.searchParams.get('v')
    if (u.hostname === 'youtu.be') return u.pathname.slice(1)
  } catch {
    // 잘못된 URL 무시
  }
  return null
}
