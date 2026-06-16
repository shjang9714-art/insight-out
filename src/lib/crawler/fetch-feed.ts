import 'server-only'

const CHARSET_ALIASES: Record<string, string> = {
  'ks_c_5601-1987': 'euc-kr', 'ksc5601': 'euc-kr', 'ksc_5601': 'euc-kr',
  'cp949': 'euc-kr', 'windows-949': 'euc-kr', 'euckr': 'euc-kr', 'ms949': 'euc-kr',
}

function normalizeCharset(raw?: string | null): string {
  const c = (raw ?? '').trim().toLowerCase().replace(/["']/g, '')
  if (!c) return 'utf-8'
  return CHARSET_ALIASES[c] ?? c
}

/** rss_url 을 charset 인지 디코드해 XML 문자열로 반환 */
export async function fetchFeedText(url: string, timeoutMs = 12_000): Promise<string> {
  const ac = new AbortController()
  const timer = setTimeout(() => ac.abort(), timeoutMs)
  try {
    const res = await fetch(url, {
      signal: ac.signal,
      headers: { 'user-agent': 'Mozilla/5.0 (compatible; InsightOutBot/1.0)' },
      redirect: 'follow',
    })
    if (!res.ok) throw new Error(`피드 HTTP ${res.status}`)
    const buf = new Uint8Array(await res.arrayBuffer())

    // 1) Content-Type 헤더 charset
    let charset = ''
    const ct = res.headers.get('content-type') ?? ''
    const m = ct.match(/charset=([^;]+)/i)
    if (m) charset = m[1]

    // 2) 헤더에 없으면 선두 바이트에서 XML 선언/meta 스니핑 (latin1로 읽어 선언만 파싱)
    if (!charset) {
      const head = new TextDecoder('latin1').decode(buf.subarray(0, 1024))
      const xmlEnc  = head.match(/<\?xml[^>]*encoding=["']?([\w-]+)/i)
      const metaEnc = head.match(/charset=["']?([\w-]+)/i)
      charset = xmlEnc?.[1] ?? metaEnc?.[1] ?? ''
    }

    const label = normalizeCharset(charset)
    try {
      return new TextDecoder(label).decode(buf)
    } catch {
      return new TextDecoder('utf-8').decode(buf) // 미지원 라벨 폴백
    }
  } finally {
    clearTimeout(timer)
  }
}
