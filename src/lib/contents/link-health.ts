import 'server-only'

export type LinkHealth = 'ok' | 'dead' | 'unknown'

/** 보수적 링크 점검. 404/410=dead, 2xx/3xx=ok, 그 외(405·403·5xx·타임아웃)=unknown(마킹 보류). */
export async function checkLink(url: string): Promise<LinkHealth> {
  const probe = async (method: 'HEAD' | 'GET'): Promise<LinkHealth> => {
    try {
      const res = await fetch(url, {
        method,
        redirect: 'follow',
        signal: AbortSignal.timeout(8000),
        headers: { 'user-agent': 'Mozilla/5.0 (compatible; InsightOutBot/1.0)' },
      })
      if (res.status === 404 || res.status === 410) return 'dead'
      if (res.ok || (res.status >= 300 && res.status < 400)) return 'ok'
      return 'unknown' // 403/405/5xx 등 → 판단 보류
    } catch {
      return 'unknown' // 타임아웃·네트워크 → 보류(오판 금지)
    }
  }
  // HEAD 우선, HEAD가 unknown이면 GET 1회로 확인(HEAD 막는 사이트 대응)
  const head = await probe('HEAD')
  if (head !== 'unknown') return head
  return probe('GET')
}
