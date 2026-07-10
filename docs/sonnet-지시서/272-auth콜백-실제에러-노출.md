# 지시서 272 — /auth/callback 실패 시 실제 에러 메시지 노출 (진단용)

> 배경: 관리자 Google 로그인 실패 시 화면에 `auth_failed`(일반 라벨)만 떠 원인 파악이 어렵다. 계정/DB는 정상 확인됨(auth.users·identity·id 일치) → 원인은 `exchangeCodeForSession` 실패(PKCE flow-state·redirect 등). 실제 에러를 화면/URL로 드러내 진단을 빠르게 한다.

대상: `src/app/auth/callback/route.ts` (단일). SQL 없음. 저위험.

---

## 1. 변경
현재:
```ts
if (error) {
  console.error('[auth/callback] exchangeCodeForSession failed:', error)
  return NextResponse.redirect(`${origin}/login?error=auth_failed`)
}
```
로 바꾸기 — **실제 메시지를 login 으로 전달**(로그는 유지, 상세 포함):
```ts
if (error) {
  console.error('[auth/callback] exchangeCodeForSession failed:', {
    message: error.message,
    status: (error as { status?: number }).status,
    code: (error as { code?: string }).code,
    name: error.name,
  })
  const detail = encodeURIComponent(error.message || 'auth_failed')
  return NextResponse.redirect(`${origin}/login?error=${detail}`)
}
```
- `missing_code` 분기도 그대로 유지.
- login 페이지는 이미 `?error` 를 배너로 표시(디코드)하므로 추가 UI 변경 불필요 — 진짜 메시지가 화면에 뜬다.

## 2. 회귀 가드
- 정상 로그인(에러 없음) 경로 불변 — `${next}` 로 리다이렉트.
- 성공 흐름·쿠키 처리·PKCE 교환 로직 변경 없음(에러 문구 전달만).
- `error.message` 는 사용자 이메일 등 민감정보 미포함(Supabase auth 에러는 사유 문자열) — URL 노출 안전. 그래도 과도하게 길면 login 배너에서 자연 줄바꿈.

## 3. 검증 (Sonnet)
- `npx tsc --noEmit` 0 / `npx eslint` 0 / `npm run build`.
- 의도적 실패(예: 잘못된 code) 시 login 배너에 일반 `auth_failed` 대신 구체 메시지 노출 확인.
- 정상 로그인 회귀 없음.
- 커밋: `fix: auth 콜백 실패 시 실제 에러 노출(진단) (지시서 272)` — 배포까지.

## 4. 진단 후 후속
- 노출된 메시지로 원인 분기:
  - "invalid flow state" / "code verifier" → PKCE 쿠키 유실(쿠키 삭제·일반 창·동일 URL 재시도).
  - "redirect" / "URL" → Supabase Auth URL Configuration(Site URL·Redirect URLs)에 프로덕션 origin 등록.
  - 그 외 → 메시지 기준 재판단.
- 원인 확정되면 이 진단용 노출은 유지하거나(운영상 무해) 다시 일반 라벨로 되돌림(선택).

SQL 없음. 이 지시서는 콜백 에러 가시화(진단).
