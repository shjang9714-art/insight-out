// 583 — SSO NameID 형식 상수 (클라이언트·서버 공용)
//
// ⚠️ 이 파일은 어드민 화면(클라이언트 컴포넌트)에서도 import 한다.
//    서버 전용 경계를 추가하지 마라 — lib/mcp/scopes.ts 와 같은 이유다.
//
// 🔴 GoTrue 는 축약형('emailAddress')을 받지 않는다. 전체 URN 을 요구한다.
//    실측 400: name_id_format must be unspecified or one of <아래 4개>
//    emailAddress·unspecified 는 SAML 1.1, persistent·transient 는 SAML 2.0 네임스페이스다.
//    ⚠️ Supabase 공식 문서는 축약형이라고 적혀 있다 — 낡았다. 런타임 응답이 정본이다.

export const SSO_NAME_ID_FORMATS = [
  'urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress',
  'urn:oasis:names:tc:SAML:2.0:nameid-format:persistent',
  'urn:oasis:names:tc:SAML:2.0:nameid-format:transient',
  'urn:oasis:names:tc:SAML:1.1:nameid-format:unspecified',
] as const

export type SsoNameIdFormat = (typeof SSO_NAME_ID_FORMATS)[number]

/** 화면 표시용 짧은 이름. 값은 위 URN 그대로 보낸다. */
export const SSO_NAME_ID_LABEL: Record<SsoNameIdFormat, string> = {
  'urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress': 'emailAddress',
  'urn:oasis:names:tc:SAML:2.0:nameid-format:persistent': 'persistent',
  'urn:oasis:names:tc:SAML:2.0:nameid-format:transient': 'transient',
  'urn:oasis:names:tc:SAML:1.1:nameid-format:unspecified': 'unspecified',
}

export function isSsoNameIdFormat(value: unknown): value is SsoNameIdFormat {
  return typeof value === 'string'
    && (SSO_NAME_ID_FORMATS as readonly string[]).includes(value)
}
