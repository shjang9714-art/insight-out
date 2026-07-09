# 지시서 240 — 관리자 Google 로그인(보조 진입) + admin 역할 자동부여

목표: 관리자만 Google로 로그인할 수 있게 하되, 로그인 화면에서 **저강조 보조 진입**으로 둔다(일반 직원은 회사 이메일 OTP만). 관리자 gmail은 이미 allowlist에 있어 도메인 Hook을 통과하므로 **연결(linking) 없이 Google로 직접 로그인**하면 계정 생성·자동승인·admin 역할 자동부여된다.

David 결정: **①안(관리자 Google 계정을 그대로 관리자 계정으로 사용)**. 회사 이메일↔Google 연결(Manual Linking)은 하지 않음.

범위: `src/app/login/page.tsx`에 관리자 Google 보조 진입 추가(239 재작성본 위에). DB는 `240-관리자-google-admin역할.sql`(수희). 이 지시서는 프론트.

전제: **239(로그인 OTP)·239 SQL·240 SQL 적용 후** 의미 있음. Google provider·`/auth/callback`은 기존 유지(활성).

---

## 1. 현행/맥락
- 239로 `login/page.tsx`가 **회사 이메일 OTP 2단계**로 재작성됨(Google·비번 제거). 240은 여기에 **관리자용 Google 진입만** 되살린다.
- 도메인 Hook(239 SQL): 신규 생성 시 `@lguplus.co.kr` **또는 allowlist** 이메일만 통과. 관리자 gmail(yjhead@gmail.com 등)은 allowlist에 있어 **Google 신규 로그인이 허용**됨. 일반 직원 gmail은 차단 → "관리자 외 Google 가입 불가" 자동 강제.
- 240 SQL: `handle_new_user`가 allowlist `is_admin` 이면 `role='admin'` 자동부여(+자동승인).

## 2. 구현 — `src/app/login/page.tsx`에 관리자 보조 진입

### 2-1. 저강조 Google 진입
- OTP 카드 **아래**, 눈에 띄지 않는 **작은 텍스트 링크/버튼**으로: 예) `관리자 로그인` (muted, `text-xs text-muted-foreground`, 밑줄 hover). 클릭 시 곧바로 Google OAuth 실행(별도 폼 없이).
- Google OAuth 로직(239에서 제거된 것 최소 복원):
  ```ts
  const handleAdminGoogle = async () => {
    setLoading(true); setError(null)
    const supabase = createClient()
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${location.origin}/auth/callback` },
    })
    if (error) { setError('Google 로그인에 실패했습니다.'); setLoading(false) }
  }
  ```
- 시각 위계: **OTP가 명백한 메인**, 관리자 링크는 보조(작게, 하단, 브랜드색 강조 금지). 프리미엄 톤 해치지 않게.
- (선택) 라벨을 `관리자는 Google로 로그인` 정도로 명시해 일반 직원 혼동 최소화. 일반 직원이 눌러도 Hook이 거부(비도메인)하므로 안전하나, 라벨로 오인 줄임.

### 2-2. 거부 메시지 재사용
- 비관리자 gmail로 Google 시도 시 Hook 403 → 콜백에서 `/login?error=...`로 돌아옴(239의 에러 배너가 표시). 메시지: `사내 이메일(@lguplus.co.kr) 계정만 가입할 수 있습니다.` — 그대로 노출되면 충분.

## 3. 회귀 가드
- **일반 사용자 흐름 불변**: OTP 메인 그대로. Google 링크는 저강조 보조.
- 관리자 Google 로그인: allowlist→Hook 통과→계정 생성 시 `handle_new_user`가 `role='admin'`+approved(240 SQL). **기존 관리자 계정은 트리거(신규 전용)와 무관, 영향 없음.**
- 일반 직원 Google 시도: Hook이 차단 → 계정 미생성, 에러 메시지. 보안 유지.
- Google provider·`/auth/callback`·미들웨어 publicPaths 변경 없음(이미 존재).
- Manual Linking 미사용(①안) → 대시보드 추가 설정 불필요. Google provider만 활성 유지.

## 4. 검증 (Sonnet)
- `npx tsc --noEmit` 0, `npx eslint`(login/page.tsx) 0, `npm run build`.
- 육안: OTP가 메인, 관리자 Google은 하단 저강조. 프리미엄 톤 유지.
- (배포 후) 관리자 gmail Google 로그인 → 대시보드 진입 + `/admin` 접근(admin 역할). 비관리자 gmail → 도메인 거부 메시지.

## 5. 라이브 체크리스트 (239·239SQL·240SQL 적용 후)
- [ ] 로그인 화면: OTP 메인 + 관리자 Google 저강조 진입.
- [ ] 관리자 gmail → Google 로그인 성공, `role='admin'`(/admin 접근 가능), 자동승인.
- [ ] 비관리자 gmail → Google 시도 시 도메인 거부 메시지.
- [ ] 일반 직원 → 회사 이메일 OTP 정상.

## 6. 선행/후속 (David·수희 — 코드 아님)
- **240 SQL(수희)**: allowlist `is_admin` + `handle_new_user` 최종판. **239 SQL 뒤에 적용**(handle_new_user 대체).
- **Supabase 대시보드(David)**: Google provider 활성 유지(이미). ①안이라 Manual Linking·추가 설정 불필요.
- allowlist에 관리자 추가/변경은 `signup_email_allowlist`에서 `is_admin=true`로 관리(향후 관리자 늘릴 때 이 테이블만 수정).

프론트: 관리자 저강조 Google 진입 1개. DB는 240 SQL.
