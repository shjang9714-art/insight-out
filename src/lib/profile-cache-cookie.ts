// 미들웨어의 매 요청 users profile 조회(gating 필드)를 서명 httpOnly 쿠키로 캐시(지시서 232 Part A).
// Web Crypto(crypto.subtle) 사용 — Edge/Node 런타임 모두 호환.

export const PROFILE_COOKIE_NAME = 'uo'
export const PROFILE_COOKIE_TTL_SECONDS = 15 * 60 // 15분. /admin 경로는 이 캐시를 건너뛰고 매 요청 DB를 본다(지시서 506) — 그 외 경로는 승인취소/강등 등 타 세션발 전이가 이 TTL 내로 반영된다.

export interface CachedProfile {
  uid: string
  onboardingCompleted: boolean
  role: string
  approvalStatus: string
  hasPassword: boolean
}

function getSecret(): string | null {
  // 이미 서버 전용으로 항상 설정되는 값 재사용 — 별도 시크릿 프로비저닝 불필요.
  return process.env.SUPABASE_SERVICE_ROLE_KEY ?? null
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = ''
  bytes.forEach((b) => { binary += String.fromCharCode(b) })
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64Url(str: string): Uint8Array {
  const padLen = (4 - (str.length % 4)) % 4
  const padded = str.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat(padLen)
  const binary = atob(padded)
  return Uint8Array.from(binary, (c) => c.charCodeAt(0))
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  )
}

export async function buildProfileCookie(profile: CachedProfile): Promise<string | null> {
  const secret = getSecret()
  if (!secret) return null

  const payload = JSON.stringify({
    ...profile,
    exp: Math.floor(Date.now() / 1000) + PROFILE_COOKIE_TTL_SECONDS,
  })
  const payloadB64 = toBase64Url(new TextEncoder().encode(payload))
  const key = await hmacKey(secret)
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payloadB64))
  return `${payloadB64}.${toBase64Url(new Uint8Array(sig))}`
}

/** 서명 검증 + 만료 확인 + uid 일치(다른 사용자/재로그인 오염 방지) 후 캐시값 반환. 실패 시 null(호출측이 1회 재조회). */
export async function parseProfileCookie(value: string, uid: string): Promise<CachedProfile | null> {
  const secret = getSecret()
  if (!secret) return null

  const [payloadB64, sigB64] = value.split('.')
  if (!payloadB64 || !sigB64) return null

  try {
    const key = await hmacKey(secret)
    const valid = await crypto.subtle.verify(
      'HMAC',
      key,
      fromBase64Url(sigB64) as BufferSource,
      new TextEncoder().encode(payloadB64)
    )
    if (!valid) return null

    const payload = JSON.parse(new TextDecoder().decode(fromBase64Url(payloadB64))) as CachedProfile & { exp: number }
    if (payload.uid !== uid) return null
    if (payload.exp < Math.floor(Date.now() / 1000)) return null
    if (typeof payload.hasPassword !== 'boolean') return null

    return payload
  } catch {
    return null
  }
}
